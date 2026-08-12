import type { GatewayIntent } from "@/lib/cloudflare/ai-gateway";

/**
 * Task categories, and what each one is allowed to cost.
 *
 * Features name a *task*, never a model. That indirection is the whole point:
 * "summarise a customer's history" and "generate a website" have genuinely
 * different quality, latency and cost profiles, and binding either to a
 * specific model string scattered through feature code means a provider change
 * is a search-and-replace across the codebase — which is how a deprecated
 * model ends up still being called from one forgotten place.
 *
 * The per-task limits are also a cost control. `maxOutputTokens` bounds the
 * worst case of a runaway generation, and the timeout bounds how long a
 * request can hold a connection. Both are per task because a chat reply that
 * takes 60s is a broken feature, while a website generation that takes 60s is
 * normal.
 */

export type AiTask =
  | "fast_chat"
  | "rag_answer"
  | "website_generation"
  | "content_generation"
  | "classification"
  | "summarization"
  | "reasoning"
  | "embedding";

export type TaskProfile = {
  task: AiTask;
  /** Preference order. The router falls through on failure. */
  preferredModels: string[];
  maxInputTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  temperature: number;
  gatewayIntent: GatewayIntent;
  /** Credits charged against `ai_credits_monthly` per successful call. */
  creditCost: number;
};

/**
 * Model identifiers are `provider/model`.
 *
 * Workers AI leads for the cheap, high-volume tasks: it is the closest model
 * to the edge, it needs no third-party key, and a deployment that has a
 * Cloudflare account already has it. Hosted frontier models are listed after
 * it for the tasks where quality actually decides whether the feature is worth
 * shipping — nobody wants an operator's homepage written by the cheapest model
 * available.
 */
export const TASK_PROFILES: Record<AiTask, TaskProfile> = {
  fast_chat: {
    task: "fast_chat",
    preferredModels: ["groq/llama-3.3-70b-versatile", "openrouter/openai/gpt-4o-mini", "groq/llama-3.1-8b-instant", "workers-ai/@cf/meta/llama-3.1-8b-instruct", "openai/gpt-4o-mini"],
    maxInputTokens: 8_000,
    maxOutputTokens: 1_000,
    timeoutMs: 30_000,
    temperature: 0.7,
    gatewayIntent: "public_chat",
    creditCost: 1,
  },
  rag_answer: {
    task: "rag_answer",
    preferredModels: ["groq/llama-3.3-70b-versatile", "openrouter/openai/gpt-4o-mini", "openai/gpt-4o-mini", "workers-ai/@cf/meta/llama-3.1-8b-instruct"],
    maxInputTokens: 16_000,
    maxOutputTokens: 1_200,
    timeoutMs: 45_000,
    // Low, deliberately. A grounded answer that embellishes is worse than one
    // that is dull, because the whole value of retrieval is that the answer
    // came from the documents.
    temperature: 0.2,
    gatewayIntent: "rag_answer",
    creditCost: 2,
  },
  website_generation: {
    task: "website_generation",
    preferredModels: ["groq/openai/gpt-oss-120b", "groq/llama-3.3-70b-versatile", "openrouter/openai/gpt-4o", "openai/gpt-4o", "openai/gpt-4o-mini"],
    maxInputTokens: 24_000,
    maxOutputTokens: 8_000,
    timeoutMs: 120_000,
    temperature: 0.6,
    gatewayIntent: "content_generation",
    creditCost: 25,
  },
  content_generation: {
    task: "content_generation",
    preferredModels: ["groq/llama-3.3-70b-versatile", "openrouter/openai/gpt-4o-mini", "openai/gpt-4o-mini", "workers-ai/@cf/meta/llama-3.1-8b-instruct"],
    maxInputTokens: 12_000,
    maxOutputTokens: 2_000,
    timeoutMs: 60_000,
    temperature: 0.7,
    gatewayIntent: "content_generation",
    creditCost: 3,
  },
  classification: {
    task: "classification",
    preferredModels: ["groq/llama-3.1-8b-instant", "groq/llama-3.3-70b-versatile", "openrouter/openai/gpt-4o-mini", "workers-ai/@cf/meta/llama-3.1-8b-instruct", "openai/gpt-4o-mini"],
    maxInputTokens: 4_000,
    maxOutputTokens: 200,
    timeoutMs: 20_000,
    temperature: 0,
    gatewayIntent: "classification",
    creditCost: 1,
  },
  summarization: {
    task: "summarization",
    preferredModels: ["groq/llama-3.1-8b-instant", "groq/llama-3.3-70b-versatile", "openrouter/openai/gpt-4o-mini", "workers-ai/@cf/meta/llama-3.1-8b-instruct", "openai/gpt-4o-mini"],
    maxInputTokens: 16_000,
    maxOutputTokens: 800,
    timeoutMs: 45_000,
    temperature: 0.3,
    gatewayIntent: "content_generation",
    creditCost: 1,
  },
  reasoning: {
    task: "reasoning",
    preferredModels: ["groq/openai/gpt-oss-120b", "groq/llama-3.3-70b-versatile", "openrouter/openai/gpt-4o", "openai/gpt-4o", "openai/gpt-4o-mini"],
    maxInputTokens: 24_000,
    maxOutputTokens: 4_000,
    timeoutMs: 120_000,
    temperature: 0.3,
    gatewayIntent: "workspace_chat",
    creditCost: 10,
  },
  embedding: {
    task: "embedding",
    preferredModels: ["workers-ai/@cf/baai/bge-base-en-v1.5", "openai/text-embedding-3-small"],
    maxInputTokens: 8_000,
    maxOutputTokens: 0,
    timeoutMs: 30_000,
    temperature: 0,
    gatewayIntent: "embedding",
    creditCost: 0,
  },
};

export function taskProfile(task: AiTask): TaskProfile {
  return TASK_PROFILES[task];
}

export function parseModelId(modelId: string): { provider: string; model: string } {
  const separator = modelId.indexOf("/");
  if (separator === -1) return { provider: "openai", model: modelId };
  return { provider: modelId.slice(0, separator), model: modelId.slice(separator + 1) };
}

/**
 * Rough token estimate.
 *
 * Four characters per token is the usual English approximation. Deliberately
 * an estimate rather than a real tokenizer: this is used to refuse an
 * oversized prompt *before* paying to send it, where being approximately right
 * an instant early beats being exactly right after the bill. Actual usage is
 * always taken from the provider's response.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
