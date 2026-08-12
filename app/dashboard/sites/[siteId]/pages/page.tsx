import { redirect } from "next/navigation";

import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { pageSeoSchema } from "@/lib/sites/schema";
import { getSite } from "@/lib/sites/service";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { PageManager } from "@/components/sites/page-manager";
import { SectionCard } from "@/components/ui/section-card";

export default async function SitePagesPage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const { siteId } = await params;
  const site = await getSite(active.workspace.id, siteId);

  return (
    <SectionCard
      title="Pages"
      description="Add pages, set their address, and override the site-wide SEO defaults."
    >
      <PageManager
        workspaceId={active.workspace.id}
        siteId={site.id}
        canManage={canManageWorkspace(active.role)}
        pages={site.pages.map((page) => {
          const seo = pageSeoSchema.parse(page.seo);
          return {
            id: page.id,
            path: page.path,
            title: page.title,
            enabled: page.enabled,
            systemKey: page.systemKey,
            seo: { title: seo.title, description: seo.description, noindex: seo.noindex },
          };
        })}
      />
    </SectionCard>
  );
}
