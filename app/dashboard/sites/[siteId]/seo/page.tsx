import { redirect } from "next/navigation";

import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { siteSeoSchema } from "@/lib/sites/schema";
import { getSite } from "@/lib/sites/service";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { SeoForm } from "@/components/sites/seo-form";
import { SectionCard } from "@/components/ui/section-card";

export default async function SiteSeoPage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const { siteId } = await params;
  const site = await getSite(active.workspace.id, siteId);
  const domain = site.pages.length >= 0 ? `${site.subdomain}.tripistic.site` : "";

  return (
    <SectionCard
      title="Search and social"
      description="Site-wide defaults. Any page can override them from the Pages tab."
    >
      <SeoForm
        workspaceId={active.workspace.id}
        siteId={site.id}
        seo={siteSeoSchema.parse(site.seo)}
        previewOrigin={`https://${domain}`}
        canManage={canManageWorkspace(active.role)}
      />
    </SectionCard>
  );
}
