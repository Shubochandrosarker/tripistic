import { cache } from "react";
import { cookies } from "next/headers";
import type { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/api";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/constants";
import type { PlanFeatureKey } from "@/lib/plans/catalog";

/**
 * Tenancy helpers — the single path to workspace scope.
 * Every tenant-owned query must derive its workspace_id from a membership
 * verified here, never from client-supplied values alone.
 */

export const getMemberships = cache(async (userId: string) => {
  return prisma.workspaceMember.findMany({
    where: {
      userId,
      status: "active",
      workspace: { deletedAt: null, status: { not: "archived" } },
    },
    include: { workspace: true },
    orderBy: { joinedAt: "asc" },
  });
});

export type ActiveWorkspaceContext = {
  workspace: NonNullable<Awaited<ReturnType<typeof getMemberships>>>[number]["workspace"];
  membership: Awaited<ReturnType<typeof getMemberships>>[number];
  memberships: Awaited<ReturnType<typeof getMemberships>>;
  role: WorkspaceRole;
};

/**
 * Resolve the caller's active workspace: preferred cookie → verified
 * membership → fallback to first membership → null (no workspace yet).
 * Cached per request so layout + page share the same resolution.
 */
export const getActiveWorkspace = cache(
  async (userId: string): Promise<ActiveWorkspaceContext | null> => {
    const memberships = await getMemberships(userId);
    if (memberships.length === 0) return null;

    let preferred: string | undefined;
    try {
      const cookieStore = await cookies();
      preferred = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
    } catch {
      preferred = undefined;
    }

    const active = memberships.find((m) => m.workspaceId === preferred) ?? memberships[0];
    return {
      workspace: active.workspace,
      membership: active,
      memberships,
      role: active.role,
    };
  },
);

/**
 * API guard: verify the user is an active member of the workspace.
 * Throws 404 (not 403) so out-of-tenant resource existence is not leaked.
 */
/**
 * Verifies membership and, optionally, plan entitlement.
 *
 * The `feature` option puts the Phase 8 gate exactly where tenancy is already
 * checked. Every workspace-scoped route already calls this as its first act,
 * so gating here is one added argument per route rather than a new call
 * everybody has to remember — and a route that forgets tenancy is already
 * broken in a way that gets caught immediately.
 *
 * Ordering matters: membership is checked first, so a non-member gets the same
 * "Workspace not found" they always did. Answering "your plan does not include
 * this" to someone with no access would confirm the workspace exists.
 */
export async function requireWorkspaceAccess(
  userId: string,
  workspaceId: string,
  options: { feature?: PlanFeatureKey } = {},
) {
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId,
      status: "active",
      workspace: { deletedAt: null },
    },
    include: { workspace: true },
  });
  if (!membership) throw notFound("Workspace not found");

  if (options.feature) {
    const { assertFeature } = await import("@/lib/plans/entitlements");
    await assertFeature(workspaceId, options.feature);
  }

  return membership;
}

/** Count of active owners — used for last-owner protection. */
export async function countActiveOwners(workspaceId: string) {
  return prisma.workspaceMember.count({
    where: { workspaceId, role: "workspace_owner", status: "active" },
  });
}

/** Generate a unique, url-safe workspace slug from a name. */
export async function generateWorkspaceSlug(base: string) {
  const { slugify } = await import("@/lib/utils");
  const root = slugify(base);
  let candidate = root;
  let attempt = 1;
  // Bounded loop — collisions beyond a handful are practically impossible.
  while (attempt < 50) {
    const existing = await prisma.workspace.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${root}-${attempt}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}
