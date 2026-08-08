import { createHash } from "node:crypto";

import type { KnowledgeScope, Prisma } from "@prisma/client";

import { badRequest } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

import { vectorId, type VectorRecord, type VectorVisibility } from "@/lib/cloudflare/vectorize";
import { chunkFaq, chunkPreview, chunkText, type Chunk } from "@/lib/ai/rag/chunk";
import { embedTexts } from "@/lib/ai/rag/embeddings";
import { getVectorStore } from "@/lib/ai/rag/store";

/**
 * Knowledge ingestion.
 *
 * source → normalise → chunk → embed → index → record state.
 *
 * Three invariants this file exists to hold:
 *
 * **A private document always carries a workspace.** Enforced here, at write
 * time, and again in the store. A private vector written without a
 * `workspaceId` is unfilterable forever afterwards — no retrieval-time check
 * can recover it, because the metadata the filter needs is simply not there.
 * So it is refused before it is written rather than detected later.
 *
 * **Vector ids are derived, so a reindex replaces.** `doc:0`, `doc:1`. Random
 * ids would mean an edit inserts a second copy and the old text keeps being
 * retrieved — the most common way a RAG system starts citing a price that
 * changed months ago.
 *
 * **Deleting a source deletes its vectors.** PostgreSQL and Vectorize are not
 * transactional together, so the order is: delete vectors first, then the
 * rows. A crash between them leaves rows pointing at vectors that are already
 * gone, which is harmless. The other order leaves vectors nothing points at,
 * which for private content means another tenant's retrieval could still
 * surface them if a filter ever regressed.
 */

export type IndexableSource = {
  scope: KnowledgeScope;
  /** Required for `private`, must be absent for `global` and `public`. */
  workspaceId: string | null;
  sourceType: string;
  sourceId: string | null;
  title: string;
  language?: string;
  /** Free text, or a structured FAQ which is chunked one pair per vector. */
  body?: string;
  faq?: Array<{ question: string; answer: string }>;
  metadata?: Record<string, unknown>;
};

export type IndexResult = {
  sourceId: string;
  documentId: string;
  chunks: number;
  skipped: boolean;
  backend: string;
};

function checksum(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function visibilityFor(scope: KnowledgeScope): VectorVisibility {
  return scope;
}

/**
 * Rejects a source whose scope and ownership disagree.
 *
 * A `private` source with no workspace, or a `public` source that claims one,
 * are both states from which correct filtering is impossible later. Failing
 * loudly here is the only place it can be fixed.
 */
export function assertScopeConsistent(source: {
  scope: KnowledgeScope;
  workspaceId: string | null;
}): void {
  if (source.scope === "private" && !source.workspaceId) {
    throw badRequest("Private knowledge must belong to a workspace.");
  }
  if (source.scope !== "private" && source.workspaceId) {
    throw badRequest("Global and public knowledge cannot be scoped to a workspace.");
  }
}

function buildChunks(source: IndexableSource): Chunk[] {
  if (source.faq?.length) return chunkFaq(source.faq);
  if (source.body?.trim()) return chunkText(source.body);
  return [];
}

/**
 * Indexes one source, creating or updating its document and vectors.
 *
 * Skips the embedding call entirely when the checksum has not moved. That is
 * not an optimisation detail — it is the difference between an embedding bill
 * that tracks content edits and one that tracks how often the reindex job
 * runs.
 */
export async function indexSource(source: IndexableSource): Promise<IndexResult> {
  assertScopeConsistent(source);

  const chunks = buildChunks(source);
  if (chunks.length === 0) throw badRequest("There is no text to index for this source.");

  const bodyChecksum = checksum(chunks.map((chunk) => chunk.text).join("\n---\n"));
  const language = source.language ?? "en";

  const record = await prisma.knowledgeSource.upsert({
    where: {
      scope_sourceType_sourceId: {
        scope: source.scope,
        sourceType: source.sourceType,
        sourceId: source.sourceId ?? "",
      },
    },
    create: {
      workspaceId: source.workspaceId,
      scope: source.scope,
      sourceType: source.sourceType,
      sourceId: source.sourceId ?? "",
      title: source.title,
      status: "indexing",
      checksum: bodyChecksum,
      language,
      metadata: (source.metadata ?? {}) as Prisma.InputJsonValue,
    },
    update: {
      title: source.title,
      status: "indexing",
      language,
      metadata: (source.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  const existingDocument = await prisma.knowledgeDocument.findFirst({
    where: { sourceId: record.id },
    orderBy: { version: "desc" },
  });

  if (existingDocument?.checksum === bodyChecksum && existingDocument.status === "indexed") {
    await prisma.knowledgeSource.update({
      where: { id: record.id },
      data: { status: "indexed", checksum: bodyChecksum, indexedAt: new Date() },
    });
    return {
      sourceId: record.id,
      documentId: existingDocument.id,
      chunks: existingDocument.chunkCount,
      skipped: true,
      backend: "unchanged",
    };
  }

  const version = (existingDocument?.version ?? 0) + 1;
  const body = chunks.map((chunk) => chunk.text).join("\n\n");

  const document = await prisma.knowledgeDocument.upsert({
    where: { id: existingDocument?.id ?? "new" },
    create: {
      workspaceId: source.workspaceId,
      sourceId: record.id,
      scope: source.scope,
      title: source.title,
      body,
      checksum: bodyChecksum,
      language,
      version,
      status: "indexing",
    },
    update: {
      title: source.title,
      body,
      checksum: bodyChecksum,
      version,
      status: "indexing",
    },
  });

  const store = getVectorStore();

  // Old chunk refs are removed *and their vectors deleted* before new ones are
  // written. A document that shrinks from 10 chunks to 4 would otherwise leave
  // 6 orphans in the index, still retrievable and still citing removed text.
  const previousRefs = await prisma.knowledgeChunkRef.findMany({
    where: { documentId: document.id },
    select: { vectorId: true },
  });
  if (previousRefs.length > 0) {
    await store.deleteByIds(previousRefs.map((ref) => ref.vectorId));
    await prisma.knowledgeChunkRef.deleteMany({ where: { documentId: document.id } });
  }

  const { vectors, backend } = await embedTexts(chunks.map((chunk) => chunk.text));

  const records: VectorRecord[] = chunks.map((chunk, index) => ({
    id: vectorId(document.id, index),
    values: vectors[index],
    metadata: {
      ...(source.workspaceId ? { workspaceId: source.workspaceId } : {}),
      visibility: visibilityFor(source.scope),
      sourceType: source.sourceType,
      sourceId: source.sourceId ?? record.id,
      documentId: document.id,
      chunkIndex: index,
      language,
      version,
      updatedAt: new Date().toISOString(),
    },
  }));

  await store.upsert(records);

  await prisma.$transaction([
    prisma.knowledgeChunkRef.createMany({
      data: chunks.map((chunk, index) => ({
        workspaceId: source.workspaceId,
        documentId: document.id,
        chunkIndex: index,
        vectorId: vectorId(document.id, index),
        preview: chunkPreview(chunk.text),
        tokenCount: chunk.tokenCount,
      })),
    }),
    prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: { status: "indexed", chunkCount: chunks.length, indexedAt: new Date() },
    }),
    prisma.knowledgeSource.update({
      where: { id: record.id },
      data: { status: "indexed", checksum: bodyChecksum, version, indexedAt: new Date() },
    }),
  ]);

  return {
    sourceId: record.id,
    documentId: document.id,
    chunks: chunks.length,
    skipped: false,
    backend,
  };
}

/**
 * Removes a source, its documents and every vector they produced.
 *
 * Vectors first — see the module comment on ordering.
 */
export async function deleteSource(input: {
  sourceId: string;
  /** Required for private sources; the delete is scoped by it. */
  workspaceId: string | null;
}): Promise<{ deletedVectors: number }> {
  const source = await prisma.knowledgeSource.findFirst({
    where: {
      id: input.sourceId,
      // A null workspaceId only matches global/public sources, so a tenant
      // cannot delete platform knowledge by passing null.
      workspaceId: input.workspaceId,
    },
    include: { documents: { include: { chunks: { select: { vectorId: true } } } } },
  });
  if (!source) return { deletedVectors: 0 };

  const vectorIds = source.documents.flatMap((document) =>
    document.chunks.map((chunk) => chunk.vectorId),
  );

  if (vectorIds.length > 0) {
    try {
      await getVectorStore().deleteByIds(vectorIds);
    } catch (error) {
      // Do not delete the rows. They are the only record of which vectors
      // exist; losing them would make the orphans permanently unreachable for
      // cleanup. The job retries.
      logger.error("rag.vector_delete_failed", { sourceId: input.sourceId }, error);
      throw error;
    }
  }

  await prisma.knowledgeSource.delete({ where: { id: source.id } });
  return { deletedVectors: vectorIds.length };
}

/**
 * Marks a source stale so the reindex job picks it up.
 *
 * Used when the underlying record changed (a tour was edited) but re-embedding
 * inline would make the operator's save slow for no benefit they can see.
 */
export async function markSourceStale(scope: KnowledgeScope, sourceType: string, sourceId: string) {
  await prisma.knowledgeSource.updateMany({
    where: { scope, sourceType, sourceId },
    data: { status: "stale" },
  });
}

/** Reindexes stale and failed sources. Registered as a background job. */
export async function reindexStaleSources(limit = 20): Promise<{ processed: number; failed: number }> {
  const sources = await prisma.knowledgeSource.findMany({
    where: { status: { in: ["stale", "failed", "pending"] } },
    include: { documents: { orderBy: { version: "desc" }, take: 1 } },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  let processed = 0;
  let failed = 0;
  for (const source of sources) {
    const document = source.documents[0];
    if (!document) {
      await prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: "failed" },
      });
      failed += 1;
      continue;
    }
    try {
      await indexSource({
        scope: source.scope,
        workspaceId: source.workspaceId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        title: source.title,
        language: source.language,
        body: document.body,
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      logger.error("rag.reindex_failed", { sourceId: source.id }, error);
      await prisma.knowledgeSource.update({
        where: { id: source.id },
        data: { status: "failed" },
      });
    }
  }
  return { processed, failed };
}
