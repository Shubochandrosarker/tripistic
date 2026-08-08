import { accountPath, cloudflareRequest } from "@/lib/cloudflare/client";
import { cloudflareConfig, isCloudflareCapabilityConfigured } from "@/lib/cloudflare/config";

/**
 * Cloudflare Vectorize — the vector store behind Tripistic's RAG layer.
 *
 * The security property this module exists to enforce: **tenant isolation
 * happens at retrieval, in code, not in a prompt.** Vectorize supports
 * pre-query metadata filtering, so a private query is issued with a
 * `workspaceId` equality filter and simply cannot return another tenant's
 * chunks. The alternative — retrieving broadly and telling the model to ignore
 * documents that are not the caller's — is not isolation at all; it is a
 * request, and a document containing "ignore previous instructions" is enough
 * to defeat it.
 *
 * `buildTenantFilter` is therefore the single place a query filter is
 * constructed, it is exported so it can be tested directly, and
 * `queryVectors` refuses to run a private query without one. A missing filter
 * is a programming error that must fail loudly, not degrade to a broad search.
 */

export type VectorVisibility = "global" | "public" | "private";

export type VectorMetadata = {
  /** Required for `private`, absent for `global` and `public`. */
  workspaceId?: string;
  visibility: VectorVisibility;
  sourceType: string;
  sourceId: string;
  documentId: string;
  chunkIndex: number;
  language: string;
  version: number;
  /** ISO timestamp of the source content, for freshness decisions. */
  updatedAt: string;
};

export type VectorRecord = {
  id: string;
  values: number[];
  metadata: VectorMetadata;
};

export type VectorMatch = {
  id: string;
  score: number;
  metadata: VectorMetadata;
};

export type VectorQueryScope =
  | { visibility: "private"; workspaceId: string }
  | { visibility: "global" }
  | { visibility: "public" };

/**
 * Vectorize's `filter` object for a scope.
 *
 * A private scope always produces **both** conditions: the workspace *and*
 * the visibility. Filtering on `workspaceId` alone would be enough today, but
 * only because nothing yet writes a `public` vector that also carries a
 * `workspaceId` — and the moment a workspace opts a destination guide into the
 * public corpus, that assumption silently becomes a leak in the other
 * direction. Both conditions cost nothing and stay correct.
 */
export function buildTenantFilter(scope: VectorQueryScope): Record<string, unknown> {
  if (scope.visibility === "private") {
    if (!scope.workspaceId) {
      throw new Error("A private vector query requires a workspaceId filter.");
    }
    return { workspaceId: { $eq: scope.workspaceId }, visibility: { $eq: "private" } };
  }
  return { visibility: { $eq: scope.visibility } };
}

function indexPath(suffix: string): string {
  const { vectorizeIndex } = cloudflareConfig();
  if (!vectorizeIndex) throw new Error("CLOUDFLARE_VECTORIZE_INDEX is not configured.");
  return accountPath(`/vectorize/v2/indexes/${encodeURIComponent(vectorizeIndex)}${suffix}`);
}

export function isVectorizeConfigured(): boolean {
  return isCloudflareCapabilityConfigured("vectorize");
}

/**
 * Vector ids are derived from the document and chunk, never random.
 *
 * Re-indexing a changed document must overwrite the chunks it replaces. With
 * random ids an update would insert a second copy and the stale text would
 * keep being retrieved forever — the most common way a RAG system starts
 * confidently citing a price that changed six months ago.
 */
export function vectorId(documentId: string, chunkIndex: number): string {
  return `${documentId}:${chunkIndex}`;
}

/** NDJSON, one vector per line — the format the Vectorize upsert endpoint takes. */
function toNdjson(vectors: VectorRecord[]): string {
  return vectors
    .map((vector) =>
      JSON.stringify({ id: vector.id, values: vector.values, metadata: vector.metadata }),
    )
    .join("\n");
}

export async function upsertVectors(vectors: VectorRecord[]): Promise<number> {
  if (vectors.length === 0) return 0;
  for (const vector of vectors) {
    if (vector.metadata.visibility === "private" && !vector.metadata.workspaceId) {
      // Refusing here rather than at query time is the point: a private vector
      // written without a workspace can never be filtered correctly
      // afterwards, and would be retrievable by every tenant.
      throw new Error(`Private vector ${vector.id} is missing workspaceId metadata.`);
    }
  }
  const form = new FormData();
  form.append("vectors", new Blob([toNdjson(vectors)], { type: "application/x-ndjson" }), "vectors.ndjson");
  await cloudflareRequest(indexPath("/upsert"), { method: "POST", formData: form });
  return vectors.length;
}

export async function queryVectors(input: {
  vector: number[];
  scope: VectorQueryScope;
  topK?: number;
  /** Extra equality filters, e.g. `{ sourceType: { $eq: "tour" } }`. */
  additionalFilter?: Record<string, unknown>;
}): Promise<VectorMatch[]> {
  const filter = { ...buildTenantFilter(input.scope), ...(input.additionalFilter ?? {}) };
  const result = await cloudflareRequest<{
    matches?: Array<{ id: string; score: number; metadata?: VectorMetadata }>;
  }>(indexPath("/query"), {
    method: "POST",
    body: {
      vector: input.vector,
      topK: Math.min(Math.max(input.topK ?? 8, 1), 50),
      returnMetadata: "all",
      filter,
    },
  });

  const matches = result?.matches ?? [];
  return matches
    .filter((match): match is { id: string; score: number; metadata: VectorMetadata } =>
      Boolean(match.metadata),
    )
    .map((match) => ({ id: match.id, score: match.score, metadata: match.metadata }));
}

export async function deleteVectorsByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await cloudflareRequest(indexPath("/delete_by_ids"), { method: "POST", body: { ids } });
  return ids.length;
}
