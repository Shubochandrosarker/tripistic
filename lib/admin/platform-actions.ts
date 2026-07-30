import { badRequest, conflict, notFound } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

/**
 * Platform-admin operational controls.
 *
 * The gap this closes: the entire super-admin surface was read-only.
 * `app/admin/workspaces` said so out loud — "Management actions arrive in
 * later phases" — and every admin API exposed `GET` and nothing else. So the
 * only way to suspend an abusive workspace, lock out a compromised account, or
 * hand another person platform access was to open a psql session against
 * production. That is not an escalation path anyone should have to take at
 * 3am, and it leaves no audit trail.
 *
 * Every action here is audited, and each one refuses the cases that would lock
 * the platform's own operators out of it.
 */

export type ActorContext = { actorId: string; request?: Request };

/**
 * Suspending a workspace stops its members signing in to it and takes its
 * public storefront offline. It does not delete anything: the data stays, and
 * reactivating restores access exactly as it was. Destructive removal is
 * deliberately not offered here.
 */
export async function setWorkspaceStatus(
  workspaceId: string,
  status: "active" | "suspended",
  { actorId, request }: ActorContext,
) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    select: { id: true, name: true, status: true },
  });
  if (!workspace) throw notFound("Workspace not found");

  // Archived is a separate lifecycle state reached by the owner deleting their
  // account; flipping it to active here would silently undo that.
  if (workspace.status === "archived") {
    throw conflict("This workspace is archived. Archived workspaces cannot be reactivated from here.");
  }
  if (workspace.status === status) {
    return { workspace, changed: false };
  }

  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { status },
    select: { id: true, name: true, status: true },
  });

  await recordAuditEvent({
    action: status === "suspended" ? "workspace_suspended" : "workspace_reactivated",
    workspaceId,
    userId: actorId,
    entityType: "workspace",
    entityId: workspaceId,
    request,
  });
  logger.warn("admin.workspace_status_changed", { workspaceId, status });

  return { workspace: updated, changed: true };
}

/**
 * Suspending a user locks them out of every workspace they belong to.
 *
 * `getCurrentUser` re-checks `status` on every request, so an existing session
 * stops resolving immediately rather than lasting until its JWT expires.
 */
export async function setUserStatus(
  userId: string,
  status: "active" | "suspended",
  { actorId, request }: ActorContext,
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, email: true, status: true, isPlatformAdmin: true },
  });
  if (!user) throw notFound("User not found");

  // Locking yourself out is the one mistake with no in-product recovery.
  if (userId === actorId && status === "suspended") {
    throw badRequest("You cannot suspend your own account.");
  }

  if (user.status === status) return { user, changed: false };

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      status,
      // Invalidate live sessions on suspension. Without this, someone whose
      // account is suspended for compromise keeps the session they already
      // have until it expires — which is the whole window that mattered.
      ...(status === "suspended" ? { sessionVersion: { increment: 1 } } : {}),
    },
    select: { id: true, email: true, status: true, isPlatformAdmin: true },
  });

  await recordAuditEvent({
    action: status === "suspended" ? "user_suspended" : "user_reactivated",
    userId: actorId,
    entityType: "user",
    entityId: userId,
    request,
  });
  logger.warn("admin.user_status_changed", { userId, status });

  return { user: updated, changed: true };
}

/**
 * Grants or revokes platform-admin access.
 *
 * Two refusals, both about not stranding the platform:
 *
 *   - you cannot revoke your own access, because the usual way to discover
 *     that was a mistake is to no longer be able to undo it;
 *   - you cannot revoke the last remaining admin, which would leave the
 *     platform with no way in short of a database session.
 */
export type AdminRevocationCheck = {
  isSelf: boolean;
  /** Other active platform admins that would remain after this revocation. */
  remainingAdmins: number;
};

export type AdminRevocationVerdict =
  | { allowed: true }
  | { allowed: false; reason: "self" | "last_admin" };

/**
 * Whether platform-admin access may be revoked.
 *
 * Pulled out as a pure function because the two refusals are the whole point
 * and the alternative — proving them through the database — means making a
 * user the *only* admin on the platform. In a test suite that shares one
 * database across concurrently running files, arranging that would break
 * whatever else was running. The rule is testable exhaustively here; the query
 * that feeds it is exercised by the integration tests.
 */
export function canRevokePlatformAdmin(input: AdminRevocationCheck): AdminRevocationVerdict {
  // Discovering this was a mistake usually means no longer being able to undo it.
  if (input.isSelf) return { allowed: false, reason: "self" };
  // Would leave the platform with no way in short of a database session.
  if (input.remainingAdmins < 1) return { allowed: false, reason: "last_admin" };
  return { allowed: true };
}

export async function setPlatformAdmin(
  userId: string,
  isPlatformAdmin: boolean,
  { actorId, request }: ActorContext,
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, email: true, status: true, isPlatformAdmin: true },
  });
  if (!user) throw notFound("User not found");

  if (!isPlatformAdmin) {
    const remainingAdmins = user.isPlatformAdmin
      ? await prisma.user.count({
          where: { isPlatformAdmin: true, deletedAt: null, status: "active", id: { not: userId } },
        })
      : // Not currently an admin, so revoking removes nobody — the last-admin
        // rule cannot apply and the count is not worth a query.
        Number.MAX_SAFE_INTEGER;

    const verdict = canRevokePlatformAdmin({ isSelf: userId === actorId, remainingAdmins });
    if (!verdict.allowed) {
      throw verdict.reason === "self"
        ? badRequest("You cannot remove your own platform admin access.")
        : conflict("This is the last platform admin. Grant access to someone else first.");
    }
  }

  // A suspended account being handed admin rights is almost certainly a
  // mis-click, and it would take effect the moment they were reactivated.
  if (isPlatformAdmin && user.status !== "active") {
    throw conflict("Reactivate this account before granting platform admin access.");
  }

  if (user.isPlatformAdmin === isPlatformAdmin) return { user, changed: false };

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      isPlatformAdmin,
      // The flag is carried in the JWT, so an existing session would keep the
      // old value until it expired — in the revoke direction that is a
      // privilege that outlives its removal.
      sessionVersion: { increment: 1 },
    },
    select: { id: true, email: true, status: true, isPlatformAdmin: true },
  });

  await recordAuditEvent({
    action: isPlatformAdmin ? "platform_admin_granted" : "platform_admin_revoked",
    userId: actorId,
    entityType: "user",
    entityId: userId,
    request,
  });
  logger.warn("admin.platform_admin_changed", { userId, isPlatformAdmin });

  return { user: updated, changed: true };
}
