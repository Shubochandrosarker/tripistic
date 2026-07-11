import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";
import { sendDueReminders } from "@/lib/messaging/reminders";

/**
 * Platform-maintenance sweep: emails a T-24h departure reminder to every
 * confirmed booking whose departure is within the next 24 hours and hasn't
 * already been reminded, across all workspaces. Mirrors
 * `POST /api/admin/payments/expire-pending` exactly — there is no
 * in-process scheduler in this application; wiring a real interval trigger
 * is a deployment-time task, not built here.
 */
export async function POST() {
  try {
    await requirePlatformAdminApi();
    const result = await sendDueReminders();
    return json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
