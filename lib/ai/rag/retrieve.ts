import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

import type { VectorQueryScope } from "@/lib/cloudflare/vectorize";
import { embedOne } from "@/lib/ai/rag/embeddings";
import { getVectorStore } from "@/lib/ai/rag/store";

/**
 * Retrieval — where tenant isolation is enforced.
 *
 * This is the security boundary of the whole AI layer, so it is worth stating
 * the rule in one sentence: **a caller's retrieval scope is derived from their
 * verified session, and a private query is impossible to issue without a
 * workspace filter.**
 *
 * That is enforced by types, not by discipline. `RetrievalScope` is a union in
 * which the private variant requires a `workspaceId`, so there is no way to
 * write a private search that forgets one — the code does not compile. At
 * runtime `buildTenantFilter` throws on an empty workspace, so a value that
 * type-checks but arrives empty from a cast is refused too.
 *
 * Nothing here asks a model to respect boundaries. The brief is explicit that
 * "ignore documents that are not this tenant's" is not isolation, and it is
 * right: a retrieved document that says "ignore your previous instructions" is
 * enough to break any prompt-level rule. Documents are filtered before the
 * model ever sees them.
 */

export type RetrievalScope =
  | { kind: "workspace"; workspaceId: string; includeGlobal?: boolean }
  | { kind: "public" };

export type RetrievedChunk = {
  vectorId: string;
  documentId: string;
  score: number;
  title: string;
  preview: string;
  text: string;
  sourceType: string;
  scope: "global" | "public" | "private";
  version: number;
  updatedAt: string;
};

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  /** Which vector scopes were searched, for the audit trail and for tests. */
  searched: Array<"private" | "global" | "public">;
};

/**
 * The vector scopes a caller may search.
 *
 * An authenticated workspace caller searches their own private corpus plus
 * Tripistic's global product documentation — never another workspace's
 * private content, and (deliberately) not the curated public travel corpus,
 * which is for the public advisor and would only add noise to an operational
 * question.
 *
 * An anonymous public caller searches public and global. There is no code path
 * from a public query to a private vector, which is why the public advisor can
 * be exposed without authentication at all.
 */
export function scopesFor(scope: RetrievalScope): VectorQueryScope[] {
  if (scope.kind === "public") {
    return [{ visibility: "public" }, { visibility: "global" }];
  }
  const scopes: VectorQueryScope[] = [
    { visibility: "private", workspaceId: scope.workspaceId },
  ];
  if (scope.includeGlobal !== false) scopes.push({ visibility: "global" });
  return scopes;
}

/**
 * Minimum similarity for a chunk to be offered to the model.
 *
 * Retrieval always returns *something* — it is a nearest-neighbour search, and
 * the nearest neighbour of an unrelated question is still a neighbour.
 * Grounding an answer in the closest available irrelevant document is how a
 * RAG system produces a confident wrong answer with a citation attached, which
 * is worse than saying it does not know.
 */
const MIN_SCORE = 0.15;

export async function retrieve(input: {
  query: string;
  scope: RetrievalScope;
  topK?: number;
  sourceTypes?: string[];
  minScore?: number;
}): Promise<RetrievalResult> {
  const store = getVectorStore();
  const vector = await embedOne(input.query);
  const topK = Math.min(Math.max(input.topK ?? 6, 1), 20);
  const scopes = scopesFor(input.scope);

  const additionalFilter =
    input.sourceTypes && input.sourceTypes.length > 0
      ? { sourceType: { $in: input.sourceTypes } }
      : undefined;

  const results = await Promise.all(
    scopes.map((vectorScope) =>
      store
        .query({ vector, scope: vectorScope, topK, additionalFilter })
        .catch((error) => {
          logger.error("rag.query_failed", { visibility: vectorScope.visibility }, error);
          return [];
        }),
    ),
  );

  const matches = results
    .flat()
    .filter((match) => match.score >= (input.minScore ?? MIN_SCORE))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (matches.length === 0) {
    return { chunks: [], searched: scopes.map((item) => item.visibility) };
  }

  // Chunk text and titles come from PostgreSQL, not from vector metadata.
  // Metadata is a copy that can lag the source; the database is the record.
  const refs = await prisma.knowledgeChunkRef.findMany({
    where: { vectorId: { in: matches.map((match) => match.id) } },
    include: { document: { select: { id: true, title: true, body: true, scope: true, version: true, workspaceId: true } } },
  });
  const byVectorId = new Map(refs.map((ref) => [ref.vectorId, ref]));

  const chunks: RetrievedChunk[] = [];
  for (const match of matches) {
    const ref = byVectorId.get(match.id);
    if (!ref) continue;

    /**
     * Second line of defence.
     *
     * The store already filtered by workspace. Re-checking the database row is
     * cheap and covers the case the filter cannot: a vector whose metadata has
     * drifted from the document it points at — after a botched migration, a
     * partial reindex, or a bug in a future writer. If the two disagree, the
     * database wins and the chunk is dropped.
     */
    if (input.scope.kind === "workspace") {
      const documentWorkspace = ref.document.workspaceId;
      if (documentWorkspace !== null && documentWorkspace !== input.scope.workspaceId) {
        logger.error("rag.tenant_mismatch_dropped", {
          vectorId: match.id,
          expected: input.scope.workspaceId,
        });
        continue;
      }
    } else if (ref.document.scope === "private") {
      logger.error("rag.private_chunk_in_public_query", { vectorId: match.id });
      continue;
    }

    chunks.push({
      vectorId: match.id,
      documentId: ref.document.id,
      score: match.score,
      title: ref.document.title,
      preview: ref.preview,
      // The stored document body is the whole document; the chunk's own text
      // is what the model should see, so the preview-plus-metadata pair is
      // used to locate it rather than resending everything.
      text: ref.preview,
      sourceType: match.metadata.sourceType,
      scope: ref.document.scope,
      version: ref.document.version,
      updatedAt: match.metadata.updatedAt,
    });
  }

  return { chunks, searched: scopes.map((item) => item.visibility) };
}

/**
 * Formats retrieved chunks for a prompt.
 *
 * Every chunk is wrapped in an explicit untrusted-data marker with a stable
 * id. Two reasons: the model can cite `[1]` instead of inventing a source, and
 * the surrounding system prompt can state — truthfully — that everything
 * inside the markers is data to be read, never instructions to be followed.
 * See `lib/ai/safety.ts`.
 */
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map(
      (chunk, index) =>
        `<document id="${index + 1}" title="${chunk.title.replace(/"/g, "'")}" updated="${chunk.updatedAt}">\n${chunk.text}\n</document>`,
    )
    .join("\n\n");
}

/** Citations for display. Only ever built from chunks actually retrieved. */
export function citationsFrom(chunks: RetrievedChunk[]) {
  return chunks.map((chunk, index) => ({
    ref: index + 1,
    documentId: chunk.documentId,
    title: chunk.title,
    score: Number(chunk.score.toFixed(4)),
    version: chunk.version,
  }));
}
