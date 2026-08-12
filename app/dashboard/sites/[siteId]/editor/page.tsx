import { redirect } from "next/navigation";

import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSite, parsePageContent } from "@/lib/sites/service";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { SiteEditor } from "@/components/sites/site-editor";

export default async function SiteEditorPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const workspaceId = active.workspace.id;
  const { siteId } = await params;
  const site = await getSite(workspaceId, siteId);

  // Tours are offered to the tour-picker fields. Archived ones are included
  // deliberately: a page can legitimately reference a tour that is paused for
  // the season, and silently dropping it from the picker would make the
  // existing selection look like a bug.
  const tours = await prisma.tour.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { title: "asc" },
    select: { id: true, title: true, status: true },
  });

  return (
    <SiteEditor
      workspaceId={workspaceId}
      siteId={site.id}
      canManage={canManageWorkspace(active.role)}
      tours={tours}
      pages={site.pages.map((page) => ({
        id: page.id,
        path: page.path,
        title: page.title,
        content: parsePageContent(page.content),
      }))}
    />
  );
}
