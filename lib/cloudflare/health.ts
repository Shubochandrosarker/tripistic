import { logger } from "@/lib/observability/logger";

import { CloudflareApiError, accountPath, cloudflareRequest } from "@/lib/cloudflare/client";
import { cloudflareConfig, isCloudflareCapabilityConfigured } from "@/lib/cloudflare/config";
import { isEdgeAuthConfigured } from "@/lib/cloudflare/edge-auth";
import { describeDispatchNamespace } from "@/lib/cloudflare/workers-platform";

/**
 * Cloudflare service health for `/admin/system-health`.
 *
 * The rule the V3 brief sets, and the reason this is not just a set of pings:
 * **an optional service that was never configured is not a failure.** A
 * deployment with no Vectorize index has an AI stack that works without RAG,
 * and painting that red trains the operator to ignore the page — which is the
 * only failure mode a status page really has.
 *
 * So each probe answers one of four states, and "Not Configured" is a
 * first-class, unalarming answer.
 */

export type CloudflareHealthState = "healthy" | "degraded" | "unavailable" | "not_configured";

export type CloudflareHealthCheck = {
  service: string;
  state: CloudflareHealthState;
  detail: string;
  /** Round-trip time, when a call was actually made. */
  latencyMs?: number;
};

async function probe(
  service: string,
  configured: boolean,
  notConfiguredDetail: string,
  run: () => Promise<string>,
): Promise<CloudflareHealthCheck> {
  if (!configured) {
    return { service, state: "not_configured", detail: notConfiguredDetail };
  }
  const started = Date.now();
  try {
    const detail = await run();
    return { service, state: "healthy", detail, latencyMs: Date.now() - started };
  } catch (error) {
    const latencyMs = Date.now() - started;
    // An authentication or permission error is a configuration problem the
    // operator can fix; a 5xx or a timeout is Cloudflare having a bad day and
    // will probably resolve itself. Distinguishing them is the difference
    // between "go rotate the token" and "wait".
    const isAuth = error instanceof CloudflareApiError && (error.status === 401 || error.status === 403);
    logger.warn("cloudflare.health_probe_failed", { service }, error);
    return {
      service,
      state: isAuth ? "unavailable" : "degraded",
      detail:
        error instanceof CloudflareApiError
          ? `${error.message} (HTTP ${error.status})`
          : "Probe failed.",
      latencyMs,
    };
  }
}

export async function checkCloudflareHealth(): Promise<CloudflareHealthCheck[]> {
  const config = cloudflareConfig();

  const checks = await Promise.all([
    probe(
      "Workers API",
      isCloudflareCapabilityConfigured("account"),
      "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set.",
      async () => {
        // Listing one Worker subdomain record is the cheapest call that
        // exercises both the token and the account scope.
        await cloudflareRequest(accountPath("/workers/subdomain"), { tolerateCodes: [10007] });
        return `Account ${config.accountId?.slice(0, 6)}… reachable.`;
      },
    ),
    probe(
      "Dispatch Namespace",
      isCloudflareCapabilityConfigured("workersForPlatforms"),
      "CLOUDFLARE_DISPATCH_NAMESPACE not set — site publishing is disabled.",
      async () => {
        const namespace = await describeDispatchNamespace();
        return `Namespace ${namespace?.name} reachable.`;
      },
    ),
    probe(
      "Custom Hostnames",
      isCloudflareCapabilityConfigured("customHostnames"),
      "No custom-hostname zone configured — domains run in manual provider mode.",
      async () => {
        await cloudflareRequest(
          `/zones/${config.customHostnameZoneId}/custom_hostnames?per_page=1`,
        );
        return "Custom hostname API reachable.";
      },
    ),
    probe(
      "Vectorize",
      isCloudflareCapabilityConfigured("vectorize"),
      "CLOUDFLARE_VECTORIZE_INDEX not set — RAG retrieval is disabled.",
      async () => {
        await cloudflareRequest(
          accountPath(`/vectorize/v2/indexes/${encodeURIComponent(config.vectorizeIndex ?? "")}`),
        );
        return `Index ${config.vectorizeIndex} reachable.`;
      },
    ),
    probe(
      "R2",
      isCloudflareCapabilityConfigured("r2"),
      "CLOUDFLARE_R2_BUCKET not set — site assets use the configured S3 storage.",
      async () => {
        await cloudflareRequest(
          accountPath(`/r2/buckets/${encodeURIComponent(config.r2Bucket ?? "")}`),
        );
        return `Bucket ${config.r2Bucket} reachable.`;
      },
    ),
  ]);

  // Two checks that are purely local — no network call, so no probe wrapper.
  checks.push({
    service: "AI Gateway",
    state: isCloudflareCapabilityConfigured("aiGateway") ? "healthy" : "not_configured",
    detail: isCloudflareCapabilityConfigured("aiGateway")
      ? `Routing model calls through gateway ${config.aiGatewayId}.`
      : "CLOUDFLARE_AI_GATEWAY_ID not set — model calls go direct to the provider.",
  });
  checks.push({
    service: "Edge service auth",
    state: isEdgeAuthConfigured() ? "healthy" : "not_configured",
    detail: isEdgeAuthConfigured()
      ? "TRIPISTIC_WORKER_SIGNING_SECRET configured."
      : "TRIPISTIC_WORKER_SIGNING_SECRET not set — Workers cannot call Tripistic APIs.",
  });

  return checks;
}
