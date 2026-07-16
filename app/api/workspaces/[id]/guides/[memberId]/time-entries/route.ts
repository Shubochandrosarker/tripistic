import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageWorkforce, canViewWorkforce } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createTimeEntrySchema } from "@/lib/validation";
import { createTimeEntry, listTimeEntries } from "@/lib/workforce/service";

type Params = { params: Promise<{ id: string; memberId: string }> };

/** Payroll hours for a member — operator-logged, not a time-clock. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, memberId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewWorkforce(membership.role)) {
      throw forbidden("You do not have permission to view hours.");
    }
    const timeEntries = await listTimeEntries(id, memberId);
    return json({ timeEntries });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, memberId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageWorkforce(membership.role)) {
      throw forbidden("Only workspace owners and admins can log hours.");
    }

    const body = await request.json().catch(() => null);
    const data = createTimeEntrySchema.parse(body);
    const timeEntry = await createTimeEntry(id, memberId, {
      ...data,
      workedOn: new Date(`${data.workedOn}T00:00:00.000Z`),
      createdById: user.id,
    });

    await recordAuditEvent({
      action: "time_entry_created",
      workspaceId: id,
      userId: user.id,
      entityType: "staff_time_entry",
      entityId: timeEntry.id,
      metadata: { memberId, minutes: timeEntry.minutes },
      request,
    });

    return json({ timeEntry }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
