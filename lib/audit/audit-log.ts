import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

/** Phase 1 audit actions. Extend per phase — never reuse an action name for a different meaning. */
export type AuditAction =
  | "user_registered"
  | "user_login"
  | "workspace_created"
  | "workspace_updated"
  | "member_invited"
  | "member_invitation_revoked"
  | "member_joined"
  | "member_role_changed"
  | "member_removed"
  | "settings_updated"
  | "billing_updated"
  | "admin_action"
  | "tour_created"
  | "tour_updated"
  | "tour_archived"
  | "addon_created"
  | "addon_updated"
  | "addon_deleted"
  | "schedule_created"
  | "schedule_updated"
  | "schedule_deleted"
  | "availability_generated"
  | "availability_created"
  | "availability_updated"
  | "availability_cancelled"
  | "blackout_created"
  | "blackout_deleted"
  | "booking_created"
  | "booking_created_manual"
  | "booking_updated"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_completed"
  | "booking_marked_no_show"
  | "payment_created"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_refunded"
  | "payment_expired"
  | "customer_updated"
  | "customer_unsubscribed"
  | "member_invitation_emailed";

export interface AuditEventInput {
  action: AuditAction;
  workspaceId?: string | null;
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  /** Non-sensitive context only — never passwords, tokens, or secrets. */
  metadata?: Record<string, string | number | boolean | null>;
  /** Pass the incoming Request in route handlers; otherwise headers() is used when available. */
  request?: Request;
}

function firstForwardedIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

async function getRequestContext(request?: Request) {
  try {
    const h = request ? request.headers : await headers();
    return {
      ipAddress: firstForwardedIp(h.get("x-forwarded-for")) ?? h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    };
  } catch {
    // Outside a request scope (e.g. scripts) — record without client context.
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Append an audit event. Never throws into the caller path — a failed audit
 * write must not break the user action; the failure is logged server-side.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const { ipAddress, userAgent } = await getRequestContext(input.request);
    await prisma.auditLog.create({
      data: {
        action: input.action,
        workspaceId: input.workspaceId ?? null,
        userId: input.userId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ? userAgent.slice(0, 512) : null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record event", input.action, error);
  }
}
