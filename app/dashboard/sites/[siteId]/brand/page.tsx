import { redirect } from "next/navigation";

import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { getSite, parseSiteTheme } from "@/lib/sites/service";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { BrandKitForm } from "@/components/sites/brand-kit-form";
import { SectionCard } from "@/components/ui/section-card";

export default async function SiteBrandPage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const { siteId } = await params;
  const site = await getSite(active.workspace.id, siteId);

  return (
    <SectionCard
      title="Brand kit"
      description="Colours, fonts and corner radii applied to every page. Changes take effect on the live site when you publish."
    >
      <BrandKitForm
        workspaceId={active.workspace.id}
        siteId={site.id}
        theme={parseSiteTheme(site.theme)}
        canManage={canManageWorkspace(active.role)}
      />
    </SectionCard>
  );
}
