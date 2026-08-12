import { aiGatewayToken, cloudflareConfig, isCloudflareCapabilityConfigured } from "@/lib/cloudflare/config";

/**
 * Cloudflare AI Gateway routing.
 *
 * The gateway sits between Tripistic and whichever model provider a task
 * resolves to, and gives four things the application would otherwise have to
 * build: per-request analytics and cost attribution, request logging, retries
 * and fallbacks, and a cache. Only the first three are wanted everywhere.
 *
 * **Caching is opt-in per surface, and off for retrieval.** Cloudflare's own
 * guidance warns that an AI Search / RAG indexing gateway needs care with
 * caching and rate limiting: a cached embedding response keyed on text alone
 * would be shared across tenants, and a rate limit applied at the gateway
 * would throttle a bulk reindex into failure rather than queueing it. So
 * `gatewayHeaders` takes an explicit intent and turns the cache on only for
 * surfaces where a shared answer is safe — never for embeddings, never for
 * anything carrying private workspace text.
 *
 * When the gateway is not configured the caller talks to the provider
 * directly. Losing analytics is a degradation; losing the AI features is not
 * acceptable for a deployment that has provider keys but no Cloudflare
 * account.
 */

export type GatewayIntent =
  | "public_chat"
  | "workspace_chat"
  | "rag_answer"
  | "embedding"
  | "content_generation"
  | "classification";

export function isAiGatewayConfigured(): boolean {
  return isCloudflareCapabilityConfigured("aiGateway");
}

/**
 * Base URL for a provider behind the gateway, or `null` when unconfigured.
 *
 * `provider` is the gateway's provider slug — `openai`, `workers-ai`,
 * `anthropic`, `openrouter` — not a Tripistic name.
 */
export function gatewayBaseUrl(provider: string): string | null {
  const { aiGatewayAccountId, aiGatewayId } = cloudflareConfig();
  if (!aiGatewayAccountId || !aiGatewayId) return null;
  return `https://gateway.ai.cloudflare.com/v1/${aiGatewayAccountId}/${aiGatewayId}/${provider}`;
}

/**
 * Whether a shared cache entry is ever safe for this intent.
 *
 * Public marketing chat is the only surface where two different callers
 * asking the same question should be allowed to receive the same stored
 * answer. Everything else either carries tenant text in the prompt or feeds a
 * per-tenant index.
 */
export function isCacheableIntent(intent: GatewayIntent): boolean {
  return intent === "public_chat";
}

export type GatewayHeaderOptions = {
  intent: GatewayIntent;
  /** Correlation id, so a gateway log line can be tied to an app request. */
  requestId?: string;
  /** Seconds. Only applied when the intent is cacheable. */
  cacheTtlSeconds?: number;
  /** Provider-side attempts the gateway makes before giving up. */
  maxAttempts?: number;
};

/**
 * Control headers for a gateway request.
 *
 * `cf-aig-metadata` deliberately carries only ids and enum-ish labels —
 * workspace id, surface, task. No prompt text, no customer names, no email
 * addresses. Gateway logs are a second copy of whatever is put in them, held
 * outside the application's own deletion paths, so the rule is the same as for
 * application logs: identifiers yes, content no.
 */
export function gatewayHeaders(
  options: GatewayHeaderOptions & { workspaceId?: string; surface?: string },
): Record<string, string> {
  const headers: Record<string, string> = {};

  // Present only when the gateway's "Authenticated Gateway" setting is on and
  // a token has been issued for it (Settings -> Authenticated Gateway ->
  // Create authentication token). Omitted otherwise so an unauthenticated
  // gateway keeps working with zero configuration.
  const token = aiGatewayToken();
  if (token) headers["cf-aig-authorization"] = `Bearer ${token}`;

  if (isCacheableIntent(options.intent)) {
    headers["cf-aig-cache-ttl"] = String(options.cacheTtlSeconds ?? 3600);
  } else {
    headers["cf-aig-skip-cache"] = "true";
  }

  if (options.maxAttempts && options.maxAttempts > 1) {
    headers["cf-aig-max-attempts"] = String(options.maxAttempts);
  }
  if (options.requestId) headers["cf-aig-request-id"] = options.requestId;

  headers["cf-aig-metadata"] = JSON.stringify({
    workspaceId: options.workspaceId ?? null,
    surface: options.surface ?? null,
    intent: options.intent,
  });

  return headers;
}
