import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";
import { sweepExpiredPendingBookings } from "@/lib/payments/expiration";

/**
 * Platform-maintenance sweep: cancels every still-`pending` booking whose
 * payment window has passed and releases its seats, across all workspaces.
 * There is no in-process scheduler in this application — wiring a real
 * interval trigger (Vercel Cron, a hosting platform's scheduled job, etc.)
 * to call this on a cadence is a deployment-time task, not built here.
 */
export async function POST() {
  try {
    await requirePlatformAdminApi();
    const result = await sweepExpiredPendingBookings();
    return json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
