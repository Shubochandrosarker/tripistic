import { handleApiError } from "@/lib/api";
import { callerIp, consumeRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/security/rate-limit";

import { findX402Route, x402Readiness } from "@/lib/x402/config";
import { parseProof, verifyPayment } from "@/lib/x402/verify";

/**
 * Exchanges a settled payment for an access token.
 *
 * The second half of the x402 handshake: the agent received a 402 describing
 * the price, paid on-chain, and posts the settlement reference here. The token
 * comes back exactly once — it is stored only as a SHA-256 — so a client that
 * loses it must pay again.
 *
 * Returns 404 rather than 503 when x402 is disabled, matching the gate. An
 * experimental rail that is switched off should look absent, not dormant.
 */
export async function POST(request: Request) {
  try {
    if (!x402Readiness().ready) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const decision = await consumeRateLimit(RATE_LIMITS.aiPublicChat, `x402:verify:${callerIp(request)}`);
    if (!decision.allowed) {
      return Response.json(
        { error: "Too many requests." },
        { status: 429, headers: rateLimitHeaders(decision) },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const routePath = typeof body?.resource === "string" ? body.resource : "";
    const route = findX402Route(routePath);
    if (!route) {
      return Response.json({ error: "Unknown resource." }, { status: 400 });
    }

    const outcome = await verifyPayment({ proof: parseProof(body), route });
    if (!outcome.ok) {
      return Response.json({ error: outcome.reason }, { status: outcome.status });
    }

    return Response.json(
      {
        token: outcome.grant.token,
        tokenType: "Bearer",
        resource: route.path,
        expiresAt: outcome.grant.expiresAt.toISOString(),
        maxUses: outcome.grant.maxUses,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = "force-dynamic";
