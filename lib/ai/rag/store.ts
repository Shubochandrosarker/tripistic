import {
  buildTenantFilter,
  deleteVectorsByIds,
  isVectorizeConfigured,
  queryVectors,
  upsertVectors,
  type VectorMatch,
  type VectorMetadata,
  type VectorQueryScope,
  type VectorRecord,
} from "@/lib/cloudflare/vectorize";

/**
 * The vector store behind RAG, behind an interface.
 *
 * Two implementations, and the reason for the second one matters:
 *
 *   - **Vectorize** in any deployment that has an index.
 *   - **In-memory** otherwise — for local development, for CI, and for the
 *     cross-tenant isolation tests the brief makes mandatory.
 *
 * The in-memory store is not a stub that returns whatever the test wants. It
 * evaluates the *same filter object* `buildTenantFilter` produces, through
 * `matchesFilter` below, which is a faithful implementation of the Vectorize
 * `$eq`/`$in`/`$ne` semantics. So a test that proves workspace B cannot
 * retrieve workspace A's chunk is proving something about the filter Tripistic
 * actually sends, not about a mock's convenience.
 *
 * What it cannot prove is that Cloudflare honours that filter. That is
 * recorded as a limitation in docs/v3/RAG.md rather than papered over.
 */

export type VectorStore = {
  readonly name: string;
  upsert(vectors: VectorRecord[]): Promise<number>;
  query(input: {
    vector: number[];
    scope: VectorQueryScope;
    topK?: number;
    additionalFilter?: Record<string, unknown>;
  }): Promise<VectorMatch[]>;
  deleteByIds(ids: string[]): Promise<number>;
};

/**
 * Evaluates a Vectorize-shaped metadata filter.
 *
 * Supports the operators Tripistic emits — `$eq`, `$ne`, `$in` — and treats a
 * bare value as `$eq`. An **unrecognised operator does not match**, rather
 * than being ignored: silently dropping a condition you do not understand is
 * how a filter meant to enforce tenancy quietly stops enforcing it.
 */
export function matchesFilter(
  metadata: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  for (const [key, condition] of Object.entries(filter)) {
    const value = metadata[key];

    if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
      const entries = Object.entries(condition as Record<string, unknown>);
      if (entries.length === 0) return false;
      for (const [operator, operand] of entries) {
        switch (operator) {
          case "$eq":
            if (value !== operand) return false;
            break;
          case "$ne":
            if (value === operand) return false;
            break;
          case "$in":
            if (!Array.isArray(operand) || !operand.includes(value)) return false;
            break;
          default:
            return false;
        }
      }
      continue;
    }

    if (value !== condition) return false;
  }
  return true;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class VectorizeStore implements VectorStore {
  readonly name = "vectorize";

  upsert(vectors: VectorRecord[]) {
    return upsertVectors(vectors);
  }

  query(input: Parameters<VectorStore["query"]>[0]) {
    return queryVectors(input);
  }

  deleteByIds(ids: string[]) {
    return deleteVectorsByIds(ids);
  }
}

/**
 * Process-local store.
 *
 * Held on `globalThis` for the same reason the host cache is: Next.js reloads
 * modules in development, and a store that resets on every hot reload would
 * make local RAG behave differently from every other environment.
 */
const memoryGlobal = globalThis as typeof globalThis & {
  __tripisticVectorStore?: Map<string, VectorRecord>;
};

function memoryStore(): Map<string, VectorRecord> {
  if (!memoryGlobal.__tripisticVectorStore) memoryGlobal.__tripisticVectorStore = new Map();
  return memoryGlobal.__tripisticVectorStore;
}

class InMemoryVectorStore implements VectorStore {
  readonly name = "memory";

  async upsert(vectors: VectorRecord[]) {
    const store = memoryStore();
    for (const vector of vectors) {
      if (vector.metadata.visibility === "private" && !vector.metadata.workspaceId) {
        // Same refusal as the Vectorize path. A private vector with no
        // workspace can never be filtered correctly afterwards, and the two
        // implementations must not disagree about what is storable.
        throw new Error(`Private vector ${vector.id} is missing workspaceId metadata.`);
      }
      store.set(vector.id, vector);
    }
    return vectors.length;
  }

  async query(input: Parameters<VectorStore["query"]>[0]) {
    const filter = { ...buildTenantFilter(input.scope), ...(input.additionalFilter ?? {}) };
    const topK = Math.min(Math.max(input.topK ?? 8, 1), 50);

    return [...memoryStore().values()]
      .filter((record) => matchesFilter(record.metadata as unknown as Record<string, unknown>, filter))
      .map((record) => ({
        id: record.id,
        score: cosineSimilarity(input.vector, record.values),
        metadata: record.metadata as VectorMetadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async deleteByIds(ids: string[]) {
    const store = memoryStore();
    let removed = 0;
    for (const id of ids) if (store.delete(id)) removed += 1;
    return removed;
  }
}

export function getVectorStore(): VectorStore {
  return isVectorizeConfigured() ? new VectorizeStore() : new InMemoryVectorStore();
}

/** Test hook. Never called from application code. */
export function clearMemoryVectorStore(): void {
  memoryStore().clear();
}
