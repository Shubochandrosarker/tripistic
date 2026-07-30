import { describe, expect, it } from "vitest";

import {
  advisoryLockKey,
  disconnectJobRunner,
  runJob,
  singleConnectionUrl,
  verifyCronSecret,
  type JobDefinition,
} from "@/lib/jobs/runner";
import { JOBS, findJob, jobNames } from "@/lib/jobs/registry";
import { prisma } from "./helpers";

/**
 * Phase 4: the scheduler. docs/FINAL-LAUNCH-AUDIT.md §5 records that every one
 * of these job bodies already existed and was correct — what was missing was
 * anything that called them. These tests cover the calling machinery.
 */

function probeJob(name: string, run: JobDefinition["run"]): JobDefinition {
  return { name, description: "test probe", run };
}

const uniqueName = () => `test.probe-${Math.random().toString(36).slice(2, 10)}`;

describe("advisory lock key", () => {
  it("is stable for a name and distinct between names", () => {
    expect(advisoryLockKey("payments.expire-pending")).toBe(
      advisoryLockKey("payments.expire-pending"),
    );
    expect(advisoryLockKey("payments.expire-pending")).not.toBe(
      advisoryLockKey("messaging.send-reminders"),
    );
  });

  it("fits a signed 64-bit integer, which is what Postgres accepts", () => {
    for (const name of jobNames()) {
      const key = advisoryLockKey(name);
      expect(key).toBeGreaterThanOrEqual(-(2n ** 63n));
      expect(key).toBeLessThan(2n ** 63n);
    }
  });

  it("gives every registered job a distinct key", () => {
    const keys = new Set(jobNames().map((name) => advisoryLockKey(name)));
    expect(keys.size).toBe(JOBS.length);
  });
});

describe("cron secret", () => {
  it("rejects absent, empty and mismatched secrets", () => {
    expect(verifyCronSecret(null, "expected")).toBe(false);
    expect(verifyCronSecret("expected", undefined)).toBe(false);
    expect(verifyCronSecret("expected", "")).toBe(false);
    expect(verifyCronSecret("", "expected")).toBe(false);
    expect(verifyCronSecret("wrong", "expected")).toBe(false);
    // A correct prefix must not pass — the length guard runs before compare.
    expect(verifyCronSecret("expect", "expected")).toBe(false);
    expect(verifyCronSecret("expectedd", "expected")).toBe(false);
  });

  it("accepts an exact match", () => {
    expect(verifyCronSecret("s3cret-value", "s3cret-value")).toBe(true);
  });
});

describe("single-connection lock URL", () => {
  it("pins the pool to one connection", () => {
    const url = new URL(singleConnectionUrl("postgresql://u:p@host:5432/db"));
    expect(url.searchParams.get("connection_limit")).toBe("1");
  });

  it("preserves existing query parameters", () => {
    const url = new URL(singleConnectionUrl("postgresql://u:p@host:5432/db?schema=public"));
    expect(url.searchParams.get("schema")).toBe("public");
    expect(url.searchParams.get("connection_limit")).toBe("1");
  });

  it("overrides a larger limit rather than appending a duplicate", () => {
    const url = new URL(singleConnectionUrl("postgresql://u:p@host:5432/db?connection_limit=20"));
    expect(url.searchParams.getAll("connection_limit")).toEqual(["1"]);
  });
});

describe("runJob", () => {
  it("records a successful run with its result and duration", async () => {
    const name = uniqueName();
    const outcome = await runJob(probeJob(name, async () => ({ scanned: 3, expired: 1 })), {
      triggeredBy: "test",
    });

    expect(outcome.status).toBe("succeeded");
    expect(outcome.result).toEqual({ scanned: 3, expired: 1 });

    const run = await prisma.jobRun.findFirstOrThrow({ where: { jobName: name } });
    expect(run.status).toBe("succeeded");
    expect(run.triggeredBy).toBe("test");
    expect(run.lockSkipped).toBe(false);
    expect(run.finishedAt).not.toBeNull();
    expect(run.durationMs).not.toBeNull();
    expect(run.result).toEqual({ scanned: 3, expired: 1 });
  });

  it("records a failure without throwing, so one bad job cannot stop the tick", async () => {
    const name = uniqueName();
    const outcome = await runJob(
      probeJob(name, async () => {
        throw new Error("provider unreachable");
      }),
      { triggeredBy: "test" },
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.error).toBe("provider unreachable");

    const run = await prisma.jobRun.findFirstOrThrow({ where: { jobName: name } });
    expect(run.status).toBe("failed");
    expect(run.error).toBe("provider unreachable");
    expect(run.finishedAt).not.toBeNull();
  });

  it("releases the lock after a failure, so the next tick still runs", async () => {
    const name = uniqueName();
    await runJob(
      probeJob(name, async () => {
        throw new Error("first attempt failed");
      }),
    );

    // If the unlock only happened on the success path, this would be skipped
    // — and the job would be dead for the lifetime of the process.
    const second = await runJob(probeJob(name, async () => ({ ok: true })));
    expect(second.status).toBe("succeeded");
  });

  it("takes and releases the lock on the same connection", async () => {
    const name = uniqueName();
    await runJob(probeJob(name, async () => ({ ok: true })));

    // A leaked session lock is invisible in the job outcome but fatal: it
    // stops every future run. Assert against pg_locks directly.
    const key = advisoryLockKey(name);
    const held = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM pg_locks
      WHERE locktype = 'advisory' AND ((classid::bigint << 32) | objid::bigint) = ${key}::bigint
    `;
    expect(Number(held[0].count)).toBe(0);
  });

  it("skips rather than queues when another instance holds the lock", async () => {
    const name = uniqueName();
    const key = advisoryLockKey(name);
    let ran = false;

    // Simulate a second worker by holding the lock on an unrelated connection.
    await prisma.$transaction(async (tx) => {
      // The transaction-scoped variant releases on commit, so a failure here
      // cannot strand the lock and poison later tests. `pg_advisory_xact_lock`
      // itself returns void, which Prisma cannot deserialize — the `try`
      // variant returns boolean and is uncontended at this point anyway.
      const [{ held }] = await tx.$queryRaw<{ held: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${key}::bigint) AS held
      `;
      expect(held).toBe(true);

      const outcome = await runJob(
        probeJob(name, async () => {
          ran = true;
          return { ok: true };
        }),
        { triggeredBy: "test" },
      );

      expect(outcome.status).toBe("skipped");
    });

    // The body must not have executed — two concurrent sweeps over the same
    // rows is the thing the lock exists to prevent.
    expect(ran).toBe(false);

    const run = await prisma.jobRun.findFirstOrThrow({ where: { jobName: name } });
    expect(run.lockSkipped).toBe(true);
    // Not `succeeded`: a history where every tick is skipped must not read as
    // a healthy job on the admin health page.
    expect(run.status).toBe("skipped");
  });

  it("runs the real expire-pending job end to end", async () => {
    const job = findJob("payments.expire-pending");
    expect(job).toBeDefined();

    const outcome = await runJob(job!, { triggeredBy: "test" });
    expect(outcome.status).toBe("succeeded");
    expect(outcome.result).toHaveProperty("scanned");
    expect(outcome.result).toHaveProperty("expired");

    await disconnectJobRunner();
  });
});

describe("job registry", () => {
  it("exposes unique names and resolves each one", () => {
    expect(new Set(jobNames()).size).toBe(JOBS.length);
    for (const name of jobNames()) expect(findJob(name)?.name).toBe(name);
  });

  it("returns undefined for an unknown name rather than throwing", () => {
    expect(findJob("does.not-exist")).toBeUndefined();
  });
});
