import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe — is this process running and able to respond?
 *
 * Deliberately checks nothing else. A liveness probe that touches the
 * database would restart a perfectly healthy app during a brief database
 * blip, turning a recoverable dependency outage into an outage of everything.
 * Readiness is what depends on dependencies; see `../ready`.
 */
export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
