import { consumeRateLimit, RATE_LIMITS, callerIp, rateLimitHeaders } from "@/lib/security/rate-limit";

import { consumeGrant } from "@/lib/x402/grants";
import { findX402Route, x402Readiness, type X402Route } from "@/lib/x402/config";

/**
 * The 402 gate.
 *
 * Sits in front of the agent routes and answers one question: may this caller
 * proceed? Three outcomes, and the middle one is the interesting part of the
 * protocol.
 *
 *   - **Allowed** — a valid, unexpired, unexhausted grant for *this* route.
 *   - **402 Payment Required** — with a machine-readable description of the
 *     price, the network and where to pay. An agent reads this and settles
 *     without a human ever seeing a checkout page. That is the entire point of
 *     x402: the error response *is* the interface.
 *   - **404** — x402 is not enabled on this deployment. Not 503: an unenabled
 *     experimental rail should be indistinguishable from one that was never
 *     built, rather than advertising a switch to probe at.
 *
 * Deliberately a plain function, not Next.js middleware. Edge middleware cannot
 * reach PostgreSQL, and grant redemption is a conditional UPDATE that has to.
 */

export type GateResult =
  | { allowed: true; route: X402Route; remaining: number }
  | { allowed: false; response: Response };

const BEARER = /^Bearer\s+(.+)$/i;

function paymentRequired(route: X402Route, extraHeaders: Record<string, string> = {}): Response {
  const { config } = x402Readiness();
  const requirement = {
    scheme: "exact",
    network: config.network,
    amount: route.amount,
    currency: route.currency,
    payTo: config.payTo,
    facilitator: config.facilitatorUrl,
    resource: route.path,
    description: route.description,
    // Where to send the proof once settled. Named in the response so an agent
    // does not have to have read documentation to complete the flow.
    verifyUrl: "/api/agent/x402/verify",
    maxTimeoutSeconds: 300,
  };

  return Response.json(
    { error: "Payment required", accepts: [requirement] },
    {
      status: 402,
      headers: {
        // Both forms: the header for clients that read it without parsing a
        // body, and the body for everything else.
        "X-Payment-Required": JSON.stringify(requirement),
        "Cache-Control": "no-store",
        ...extraHeaders,
      },
    },
  );
}

export async function gateX402Route(request: Request): Promise<GateResult> {
  const url = new URL(request.url);
  const route = findX402Route(url.pathname);

  // An unlisted path is not protected. Reaching here at all would be a routing
  // mistake, and failing open on an unpriced route is safer than charging for
  // something with no price.
  if (!route) {
    return { allowed: false, response: Response.json({ error: "Not found" }, { status: 404 }) };
  }

  const readiness = x402Readiness();
  if (!readiness.ready) {
    return { allowed: false, response: Response.json({ error: "Not found" }, { status: 404 }) };
  }

  // Rate limited before any database work. A 402 endpoint is unauthenticated by
  // design, so without this the cheapest attack is to ask for the price a
  // million times.
  const decision = await consumeRateLimit(RATE_LIMITS.aiPublicChat, `x402:${callerIp(request)}`);
  if (!decision.allowed) {
    return {
      allowed: false,
      response: Response.json(
        { error: "Too many requests." },
        { status: 429, headers: rateLimitHeaders(decision) },
      ),
    };
  }

  const match = BEARER.exec(request.headers.get("authorization") ?? "");
  if (!match) return { allowed: false, response: paymentRequired(route) };

  const check = await consumeGrant(match[1].trim(), route.path);
  if (!check.ok) {
    // Every rejection returns the same 402 with the price. Distinguishing
    // "expired" from "never existed" would tell a caller probing tokens which
    // guesses were once valid, and a paying agent's correct action is identical
    // in both cases: pay again.
    return {
      allowed: false,
      response: paymentRequired(route, { "X-Payment-Rejected": check.reason }),
    };
  }

  return { allowed: true, route, remaining: check.remaining };
}
