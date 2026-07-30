import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Readiness probe — can this instance actually serve traffic?
 *
 * Checks the one dependency without which nothing works. Returns 503 when the
 * database is unreachable so a load balancer stops routing to this instance
 * rather than serving errors to users.
 *
 * Response bodies are intentionally bare. A probe is unauthenticated and
 * reachable from anywhere, so it must never leak connection strings, driver
 * messages, versions, or stack traces — the error is logged server-side and
 * the caller gets a boolean.
 */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ready", checks: { database: "ok" }, durationMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[health/ready] database check failed:", error);
    return NextResponse.json(
      { status: "unavailable", checks: { database: "failed" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
