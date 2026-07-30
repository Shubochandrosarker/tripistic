import { describe, expect, it } from "vitest";

import {
  SKIP_ALARM_THRESHOLD,
  STALL_THRESHOLD_MS,
  classifyJob,
  overallJobState,
  type JobHealth,
} from "@/lib/jobs/health";

/**
 * Phase 6 — the admin health page used to render `status="ready"` and
 * `status="manual"` as literals. They described intent, not reality, and
 * would have kept reporting "ready" while the worker was down. This is the
 * classification that replaces them.
 */

const NOW = new Date("2026-07-30T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

describe("classifyJob", () => {
  it("reports a recent success as healthy", () => {
    expect(
      classifyJob({ lastRunAt: minutesAgo(1), lastStatus: "succeeded", consecutiveSkips: 0 }, NOW),
    ).toBe("healthy");
  });

  it("reports a job that has never run", () => {
    // Distinct from stalled: a fresh deployment has no history, which is not
    // the same as a worker that stopped.
    expect(classifyJob({ lastRunAt: null, lastStatus: null, consecutiveSkips: 0 }, NOW)).toBe("never_run");
  });

  it("reports a stale job as stalled — this is what a dead worker looks like", () => {
    const stale = new Date(NOW.getTime() - STALL_THRESHOLD_MS - 60_000);
    expect(classifyJob({ lastRunAt: stale, lastStatus: "succeeded", consecutiveSkips: 0 }, NOW)).toBe("stalled");
  });

  it("tolerates a tick or two of lateness without crying wolf", () => {
    // The worker ticks every 60s; a restart or a slow tick must not raise an
    // alarm an operator will learn to ignore.
    expect(
      classifyJob({ lastRunAt: minutesAgo(5), lastStatus: "succeeded", consecutiveSkips: 0 }, NOW),
    ).toBe("healthy");
  });

  it("reports a failure as degraded", () => {
    expect(
      classifyJob({ lastRunAt: minutesAgo(1), lastStatus: "failed", consecutiveSkips: 0 }, NOW),
    ).toBe("degraded");
  });

  it("reports a run of skips as degraded", () => {
    // Every tick skipping means nothing is being done, even though each run
    // "succeeded" in the loosest sense. This is what a leaked advisory lock
    // looks like from outside, and the whole reason `skipped` is its own
    // status rather than folded into `succeeded`.
    expect(
      classifyJob(
        { lastRunAt: minutesAgo(1), lastStatus: "skipped", consecutiveSkips: SKIP_ALARM_THRESHOLD },
        NOW,
      ),
    ).toBe("degraded");
  });

  it("does not alarm on an occasional skip", () => {
    // Two workers briefly overlapping is normal and harmless.
    expect(
      classifyJob({ lastRunAt: minutesAgo(1), lastStatus: "skipped", consecutiveSkips: 1 }, NOW),
    ).toBe("healthy");
  });

  it("treats a failure as degraded even when it is also stale", () => {
    // "It failed" is more actionable than "it is old".
    const stale = new Date(NOW.getTime() - STALL_THRESHOLD_MS - 60_000);
    expect(classifyJob({ lastRunAt: stale, lastStatus: "failed", consecutiveSkips: 0 }, NOW)).toBe("degraded");
  });
});

describe("overallJobState", () => {
  const job = (state: JobHealth["state"]): JobHealth => ({
    name: "x",
    description: "",
    lastRunAt: null,
    lastStatus: null,
    lastDurationMs: null,
    lastError: null,
    consecutiveSkips: 0,
    state,
  });

  it("surfaces the worst state, so one broken job is not hidden by four healthy ones", () => {
    expect(overallJobState([job("healthy"), job("healthy"), job("degraded")])).toBe("degraded");
    expect(overallJobState([job("healthy"), job("stalled")])).toBe("stalled");
    expect(overallJobState([job("degraded"), job("stalled")])).toBe("degraded");
  });

  it("is healthy only when everything is", () => {
    expect(overallJobState([job("healthy"), job("healthy")])).toBe("healthy");
  });

  it("reports never_run only when nothing has run at all", () => {
    expect(overallJobState([job("never_run"), job("never_run")])).toBe("never_run");
    // A partially-started scheduler is healthy, not "never run".
    expect(overallJobState([job("never_run"), job("healthy")])).toBe("healthy");
  });
});
