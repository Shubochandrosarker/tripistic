import { handleApiError, noStoreJson } from "@/lib/api";
import { logger } from "@/lib/observability/logger";

import { authenticateEdgeRequest, isEdgeAuthConfigured } from "@/lib/cloudflare/edge-auth";
import { resolveSiteRoute } from "@/lib/sites/routing";

/**
 * The dispatch Worker's routing lookup.
 *
 * Answers "which script serves this hostname?" and nothing else. Locked behind
 * the signed edge-auth path — HMAC, timestamp skew and single-use nonce — for
 * one specific reason: unauthenticated, this endpoint is a directory of every
 * tenant's live site and the internal script name that serves it, which is
 * exactly the enumeration a takeover attempt starts with.
 *
 * The response carries no tenant content. The Worker gets a script name, a
 * preview flag and the ids it needs for logging; page content is already baked
 * into the tenant Worker, which is why this stays a routing call and not a
 * content call.
 */
export async function GET(request: Request) {
  try {
    if (!isEdgeAuthConfigured()) {
      // 503, not 500. The deployment has no worker signing secret, which is a
      // configuration state the health view reports rather than a defect.
      return noStoreJson({ found: false, reason: "edge_auth_unconfigured" }, 503);
    }

    const caller = await authenticateEdgeRequest(request);
    const hostname = new URL(request.url).searchParams.get("hostname");
    if (!hostname) return noStoreJson({ found: false }, 400);

    const route = await resolveSiteRoute(hostname);
    if (!route) {
      logger.info("sites.route_miss", { requestId: caller.requestId });
      return noStoreJson({ found: false });
    }

    return noStoreJson({
      found: true,
      scriptName: route.scriptName,
      siteId: route.siteId,
      preview: route.preview,
      deploymentId: route.deploymentId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = "force-dynamic";
