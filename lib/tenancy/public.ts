import { prisma } from "@/lib/db";
import { notFound } from "@/lib/api";

/**
 * Public (unauthenticated) tenancy resolution — the counterpart to
 * `requireWorkspaceAccess` for the booking widget and public tour pages.
 * Every lookup here is scoped to `status: "active", deletedAt: null` (and,
 * for tours, `visibility: "public"`) so draft/private/archived/suspended/
 * deleted resources are structurally unreachable, not just filtered by
 * convention. 404 throughout — a hidden or nonexistent workspace/tour must
 * look identical to a caller probing for either.
 */
export async function requirePublicWorkspace(slug: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug, status: "active", deletedAt: null },
  });
  if (!workspace) throw notFound("Not found");
  return workspace;
}

export async function requirePublicTour(workspaceId: string, tourSlug: string) {
  const tour = await prisma.tour.findFirst({
    where: { workspaceId, slug: tourSlug, status: "active", visibility: "public", deletedAt: null },
  });
  if (!tour) throw notFound("Not found");
  return tour;
}
