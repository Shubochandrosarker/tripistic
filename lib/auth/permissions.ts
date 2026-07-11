import type { WorkspaceRole } from "@prisma/client";
import { ADMIN_MANAGEABLE_ROLES, type WorkspaceRoleValue } from "@/lib/constants";

/**
 * Capability checks for workspace roles. Roles are intentionally not a linear
 * hierarchy — permissions are explicit per capability (see docs/05 §2).
 */

export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === "workspace_owner" || role === "workspace_admin";
}

export function canManageBilling(role: WorkspaceRole): boolean {
  return role === "workspace_owner";
}

export function canManageMembers(role: WorkspaceRole): boolean {
  return role === "workspace_owner" || role === "workspace_admin";
}

export function canViewAuditLogs(role: WorkspaceRole): boolean {
  return role === "workspace_owner" || role === "workspace_admin";
}

/** Tour catalog, schedules, availability, and blackout management (Phase 2). */
export function canManageTours(role: WorkspaceRole): boolean {
  return role === "workspace_owner" || role === "workspace_admin";
}

/**
 * Booking operations (Phase 3): manual creation, edits, status transitions,
 * cancellation. Matches docs/05's matrix — owner/admin full control, staff
 * operates day-to-day bookings. `guide` has no general booking access until
 * assigned-departure manifests ship in Phase 6.
 */
export function canManageBookings(role: WorkspaceRole): boolean {
  return role === "workspace_owner" || role === "workspace_admin" || role === "staff";
}

/** Read-only booking access — everyone who can manage bookings, plus viewer. */
export function canViewBookings(role: WorkspaceRole): boolean {
  return canManageBookings(role) || role === "viewer";
}

/** Full guest PII (email, phone, participant notes, operator notes) — excludes viewer. */
export function canViewBookingPII(role: WorkspaceRole): boolean {
  return canManageBookings(role);
}

/**
 * Customer CRM operations (Phase 5): edit profile/notes/tags/consent.
 * Matches `canManageBookings` exactly — the roles that operate day-to-day
 * bookings are the ones who talk to guests and maintain their records.
 */
export function canManageCustomers(role: WorkspaceRole): boolean {
  return canManageBookings(role);
}

/** Read-only customer access — everyone who can manage customers, plus viewer. */
export function canViewCustomers(role: WorkspaceRole): boolean {
  return canManageCustomers(role) || role === "viewer";
}

/** Which roles may `actorRole` grant when inviting or changing a member? */
export function grantableRoles(actorRole: WorkspaceRole): WorkspaceRoleValue[] {
  if (actorRole === "workspace_owner") {
    return ["workspace_owner", "workspace_admin", "guide", "staff", "viewer"];
  }
  if (actorRole === "workspace_admin") {
    return ["workspace_admin", ...ADMIN_MANAGEABLE_ROLES];
  }
  return [];
}

/** May `actorRole` modify (change role / remove) a member holding `targetRole`? */
export function canModifyMemberWithRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
): boolean {
  if (actorRole === "workspace_owner") return true;
  if (actorRole === "workspace_admin") {
    // Admins cannot touch owners or fellow admins.
    return targetRole !== "workspace_owner" && targetRole !== "workspace_admin";
  }
  return false;
}
