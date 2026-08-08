import { createHash } from "node:crypto";

import { logger } from "@/lib/observability/logger";

import { gatewayBaseUrl, gatewayHeaders } from "@/lib/cloudflare/ai-gateway";
import { cloudflareApiToken, cloudflareConfig, isCloudflareCapabilityConfigured } from "@/lib/cloudflare/config";

/**
 * Embeddings.
 *
 * Two backends, and the second one needs to be described honestly.
 *
 * **Workers AI** (`@cf/baai/bge-base-en-v1.5`) whenever a Cloudflare account is
 * configured. Routed through the AI Gateway when one exists — with caching
 * explicitly skipped, because a cached embedding keyed on text alone would be
 * shared between tenants, and Cloudflare's own guidance warns that an indexing
 * gateway needs exactly this care.
 *
 * **A deterministic hash embedding** otherwise. It is *not semantically
 * meaningful*: similar sentences do not land near each other, so retrieval
 * quality with it is effectively random. It exists so that local development
 * and CI can exercise the whole ingestion → storage → filtered retrieval path
 * without a Cloudflare account — which is what makes the mandatory
 * cross-tenant isolation test runnable. Isolation is enforced by the metadata
 * filter, not by embedding similarity, so testing isolation against it is
 * sound even though testing *relevance* against it would be meaningless.
 *
 * `embeddingBackend()` reports which is in use so the admin health view and
 * the QA report can say so plainly rather than implying a working RAG stack.
 */

export const EMBEDDING_DIMENSIONS = 768;

export type EmbeddingBackend = "workers-ai" | "deterministic";

export function embeddingBackend(): EmbeddingBackend {
  return isCloudflareCapabilityConfigured("workersAi") ? "workers-ai" : "deterministic";
}

/**
 * Hash-based pseudo-embedding.
 *
 * Deterministic (the same text always produces the same vector) and
 * normalised, so cosine similarity is well defined and a reindex of unchanged
 * content is a no-op. That is the only property retrieval code depends on.
 */
export function deterministicEmbedding(text: string): number[] {
  const values = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const normalised = text.toLowerCase().replace(/\s+/g, " ").trim();

  // One bucket per token, signed by a second hash bit, so vocabulary overlap
  // does produce *some* similarity — enough that a nearest-neighbour ordering
  // is not pure noise for exact-term matches.
  for (const token of normalised.split(/[^a-z0-9]+/).filter(Boolean)) {
    const digest = createHash("sha256").update(token).digest();
    const bucket = digest.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
    const sign = (digest[4] & 1) === 0 ? 1 : -1;
    values[bucket] += sign;
  }

  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return values;
  return values.map((value) => value / magnitude);
}

type WorkersAiEmbeddingResponse = {
  result?: { data?: number[][] };
  success?: boolean;
};

async function workersAiEmbeddings(texts: string[], model: string): Promise<number[][]> {
  const { accountId } = cloudflareConfig();
  const token = cloudflareApiToken();
  if (!accountId || !token) throw new Error("Workers AI is not configured.");

  const gateway = gatewayBaseUrl("workers-ai");
  const url = gateway
    ? `${gateway}/${model}`
    : `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Cache explicitly off: see the module comment.
      ...gatewayHeaders({ intent: "embedding" }),
    },
    body: JSON.stringify({ text: texts }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Workers AI embedding request failed with status ${response.status}.`);
  }
  const payload = (await response.json()) as WorkersAiEmbeddingResponse;
  const data = payload.result?.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error("Workers AI returned an unexpected embedding shape.");
  }
  return data;
}

export type EmbedResult = {
  vectors: number[][];
  backend: EmbeddingBackend;
  model: string;
};

/**
 * Embeds a batch of texts.
 *
 * Falls back to the deterministic backend if Workers AI fails, and says so in
 * the result. The alternative — failing the whole ingestion — would mean a
 * transient provider error leaves a knowledge source permanently unindexed
 * with no obvious way to notice. A fallback that is *labelled* is recoverable:
 * the index job records the backend, and a reindex once the provider is
 * healthy replaces the vectors.
 */
export async function embedTexts(
  texts: string[],
  options: { model?: string } = {},
): Promise<EmbedResult> {
  if (texts.length === 0) return { vectors: [], backend: embeddingBackend(), model: "none" };

  const model = options.model ?? "@cf/baai/bge-base-en-v1.5";
  if (embeddingBackend() === "workers-ai") {
    try {
      return { vectors: await workersAiEmbeddings(texts, model), backend: "workers-ai", model };
    } catch (error) {
      logger.warn("ai.embedding_fallback", { model, count: texts.length }, error);
    }
  }

  return {
    vectors: texts.map((text) => deterministicEmbedding(text)),
    backend: "deterministic",
    model: "deterministic-hash",
  };
}

export async function embedOne(text: string): Promise<number[]> {
  const { vectors } = await embedTexts([text]);
  return vectors[0] ?? deterministicEmbedding(text);
}
