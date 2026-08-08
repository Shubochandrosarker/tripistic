import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

/** Phase 1 audit actions. Extend per phase — never reuse an action name for a different meaning. */
export type AuditAction =
  | "user_registered"
  | "user_login"
  // Phase 7 — account security. Separate actions rather than one
  // "account_event" so an operator can answer "was a reset ever completed on
  // this account, and when" without parsing metadata.
  | "user_verification_sent"
  | "user_email_verified"
  | "user_password_reset_requested"
  | "user_password_reset_completed"
  // Phase 11 — platform-admin operational controls. Named individually so
  // "who suspended this workspace, and when" is answerable without parsing
  // metadata, which is the question that actually gets asked afterwards.
  | "workspace_suspended"
  | "workspace_reactivated"
  | "user_suspended"
  | "user_reactivated"
  | "platform_admin_granted"
  | "platform_admin_revoked"
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
  // Money captured for a booking that could no longer be confirmed (cancelled
  // or expired while the guest was in checkout). Distinct from a success so it
  // is searchable rather than buried among ordinary payments.
  | "payment_requires_reconciliation"
  | "payment_failed"
  | "payment_refunded"
  | "payment_expired"
  | "payment_reconciled"
  | "payment_account_onboarding_started"
  | "payment_account_synced"
  | "payment_dispute_updated"
  | "customer_updated"
  | "customer_unsubscribed"
  | "member_invitation_emailed"
  | "guide_profile_updated"
  | "waiver_version_published"
  | "waiver_signed"
  // Phase 5 (extended) — CRM
  | "company_created"
  | "company_updated"
  | "company_archived"
  | "lead_created"
  | "lead_updated"
  | "lead_converted"
  | "crm_task_created"
  | "crm_task_updated"
  | "crm_activity_logged"
  // Phase 6 (extended) — Workforce
  | "workforce_profile_updated"
  | "time_off_created"
  | "time_off_updated"
  | "time_entry_created"
  | "guide_rating_created"
  // Phase 7 — Vehicles
  | "vehicle_created"
  | "vehicle_updated"
  | "vehicle_archived"
  | "maintenance_record_created"
  | "fuel_log_created"
  // Phase 8/9 — Operations & Dispatch
  | "ops_status_changed"
  | "ops_note_added"
  | "departure_party_assigned"
  | "booking_checked_in"
  | "incident_created"
  | "incident_updated"
  // Phase 10 — Vendors
  | "vendor_created"
  | "vendor_updated"
  | "vendor_archived"
  | "vendor_invoice_created"
  | "vendor_invoice_updated"
  // Phase 11 — AI Itinerary Builder
  | "itinerary_generated"
  | "itinerary_updated"
  | "itinerary_item_created"
  | "itinerary_item_updated"
  | "itinerary_item_deleted"
  | "itinerary_version_saved"
  | "storefront_draft_updated"
  | "storefront_published"
  | "media_upload_started"
  | "media_upload_completed"
  | "custom_domain_created"
  | "custom_domain_verified"
  | "custom_domain_activated"
  | "custom_domain_disabled"
  // V3 Site Builder. Publishing and rollback are separate actions because
  // "who put this live, and did anyone roll it back" is the question asked
  // after a bad deploy, and it should not require reading metadata.
  | "site_created"
  | "site_settings_updated"
  | "site_published"
  | "site_preview_deployed"
  | "site_rolled_back"
  | "site_deleted"
  | "site_domain_bound"
  | "site_domain_unbound";

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

/** Exported for callers that need the client IP/UA for their own record (not just the audit log) — e.g. WaiverSignature. */
export async function getRequestContext(request?: Request) {
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
    logger.error("audit.record_failed", { action: input.action }, error);
  }
}
