import { badRequest, handleApiError, json } from "@/lib/api";
import { findJob, jobNames } from "@/lib/jobs/registry";
import { runJob, verifyCronSecret } from "@/lib/jobs/runner";
import { withRequestContext } from "@/lib/observability/request";

export const dynamic = "force-dynamic";

/**
 * Scheduled-job entry point for an external scheduler.
 *
 * Authenticated by shared secret, deliberately *not* by a platform-admin
 * session. The previous trigger routes (`admin/payments/expire-pending`,
 * `admin/messages/sweep`) were session-gated, so a headless cron could not
 * call them even in principle — which is part of why nothing ever ran.
 *
 * Fails closed: with CRON_SECRET unset every request 404s, so a
 * misconfigured deployment cannot expose job execution to the internet.
 * 404 rather than 401 so the endpoint's existence is not advertised.
 *
 *   curl -X POST https://host/api/jobs/run \
 *     -H "x-tripistic-cron-secret: $CRON_SECRET" \
 *     -H "content-type: application/json" \
 *     -d '{"job":"payments.expire-pending"}'
 */
async function handlePost(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const provided =
      request.headers.get("x-tripistic-cron-secret") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      null;

    if (!verifyCronSecret(provided, secret)) {
      return json({ error: "Not found" }, 404);
    }

    const body = (await request.json().catch(() => null)) as { job?: string } | null;
    const name = body?.job;

    // No name means "run everything" — the common cron case.
    if (!name) {
      const outcomes = [];
      for (const jobName of jobNames()) {
        const job = findJob(jobName);
        if (job) outcomes.push(await runJob(job, { triggeredBy: "cron" }));
      }
      return json({ ran: outcomes.length, outcomes });
    }

    const job = findJob(name);
    if (!job) throw badRequest(`Unknown job "${name}". Known jobs: ${jobNames().join(", ")}`);

    const outcome = await runJob(job, { triggeredBy: "cron" });
    return json(outcome);
  } catch (error) {
    return handleApiError(error);
  }
}

export const POST = withRequestContext("/api/jobs/run", handlePost);
