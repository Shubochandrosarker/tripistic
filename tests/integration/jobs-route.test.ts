import { afterEach, describe, expect, it } from "vitest";

import { POST as jobsRoute } from "@/app/api/jobs/run/route";
import { GET as liveRoute } from "@/app/api/health/live/route";
import { GET as readyRoute } from "@/app/api/health/ready/route";
import { jobNames } from "@/lib/jobs/registry";
import { disconnectJobRunner } from "@/lib/jobs/runner";
import { prisma } from "./helpers";

/**
 * Phase 4: the HTTP surface of the scheduler.
 *
 * This route is authenticated by a shared secret rather than a platform-admin
 * session — deliberately. The previous trigger routes were session-gated, so a
 * headless cron could not call them even in principle, which is part of why
 * nothing ever ran (docs/FINAL-LAUNCH-AUDIT.md §5).
 */

const SECRET = "cron-secret-for-tests-0123456789";

function post(body: unknown, headers: Record<string, string> = {}) {
  return jobsRoute(
    new Request("https://example.test/api/jobs/run", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(async () => {
  delete process.env.CRON_SECRET;
  await disconnectJobRunner();
});

describe("POST /api/jobs/run — authentication", () => {
  it("fails closed with 404 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    // A misconfigured deployment must not expose job execution to the
    // internet. 404 rather than 401 so the endpoint is not advertised either.
    const res = await post({ job: "payments.expire-pending" }, { "x-tripistic-cron-secret": "" });
    expect(res.status).toBe(404);
  });

  it("rejects a missing, wrong or truncated secret", async () => {
    process.env.CRON_SECRET = SECRET;

    expect((await post({})).status).toBe(404);
    expect((await post({}, { "x-tripistic-cron-secret": "wrong" })).status).toBe(404);
    expect((await post({}, { "x-tripistic-cron-secret": SECRET.slice(0, -1) })).status).toBe(404);
    expect((await post({}, { authorization: "Bearer nope" })).status).toBe(404);
  });

  it("accepts the secret in the dedicated header or as a bearer token", async () => {
    process.env.CRON_SECRET = SECRET;

    const viaHeader = await post({ job: "auth.cleanup-tokens" }, { "x-tripistic-cron-secret": SECRET });
    expect(viaHeader.status).toBe(200);

    const viaBearer = await post({ job: "auth.cleanup-tokens" }, { authorization: `Bearer ${SECRET}` });
    expect(viaBearer.status).toBe(200);
  });
});

describe("POST /api/jobs/run — dispatch", () => {
  it("runs a single named job and reports its outcome", async () => {
    process.env.CRON_SECRET = SECRET;

    const res = await post(
      { job: "payments.expire-pending" },
      { "x-tripistic-cron-secret": SECRET },
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { jobName: string; status: string; result?: unknown };
    expect(body.jobName).toBe("payments.expire-pending");
    expect(body.status).toBe("succeeded");
    expect(body.result).toHaveProperty("scanned");
  });

  it("runs every job when no name is given — the common cron case", async () => {
    process.env.CRON_SECRET = SECRET;

    const res = await post({}, { "x-tripistic-cron-secret": SECRET });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ran: number; outcomes: { jobName: string }[] };
    expect(body.ran).toBe(jobNames().length);
    expect(body.outcomes.map((o) => o.jobName).sort()).toEqual([...jobNames()].sort());
  });

  it("rejects an unknown job name with 400 rather than silently doing nothing", async () => {
    process.env.CRON_SECRET = SECRET;

    const res = await post({ job: "does.not-exist" }, { "x-tripistic-cron-secret": SECRET });
    expect(res.status).toBe(400);
  });

  it("leaves an auditable run record behind", async () => {
    process.env.CRON_SECRET = SECRET;

    const before = await prisma.jobRun.count({ where: { jobName: "auth.cleanup-tokens" } });
    await post({ job: "auth.cleanup-tokens" }, { "x-tripistic-cron-secret": SECRET });
    const after = await prisma.jobRun.findMany({
      where: { jobName: "auth.cleanup-tokens" },
      orderBy: { startedAt: "desc" },
      take: 1,
    });

    expect(await prisma.jobRun.count({ where: { jobName: "auth.cleanup-tokens" } })).toBe(before + 1);
    expect(after[0].triggeredBy).toBe("cron");
    expect(after[0].status).toBe("succeeded");
  });
});

describe("health endpoints", () => {
  it("liveness answers without touching the database", async () => {
    // Deliberately DB-free: a liveness probe that fails on a database blip
    // makes the orchestrator restart a perfectly healthy application, turning
    // a recoverable outage into a crash loop.
    const res = await liveRoute();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("readiness reports ready while the database is reachable", async () => {
    const res = await readyRoute();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: { database: string } };
    expect(body.status).toBe("ready");
    expect(body.checks.database).toBe("ok");
  });

  it("readiness leaks nothing about the deployment", async () => {
    const body = await (await readyRoute()).text();
    // No connection strings, hostnames, driver errors or version banners —
    // this endpoint is reachable from the load balancer.
    expect(body).not.toMatch(/postgres|password|localhost|prisma|@/i);
  });
});
