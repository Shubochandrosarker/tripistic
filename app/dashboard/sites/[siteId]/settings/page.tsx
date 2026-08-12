import { redirect } from "next/navigation";

import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { siteNavigationSchema } from "@/lib/sites/schema";
import { getSite } from "@/lib/sites/service";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { SiteSettingsForm } from "@/components/sites/site-settings-form";
import { SectionCard } from "@/components/ui/section-card";

export default async function SiteSettingsPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const { siteId } = await params;
  const site = await getSite(active.workspace.id, siteId);

  return (
    <SectionCard title="Settings" description="Name, navigation and deletion.">
      <SiteSettingsForm
        workspaceId={active.workspace.id}
        siteId={site.id}
        name={site.name}
        navigation={siteNavigationSchema.parse(site.navigation)}
        canManage={canManageWorkspace(active.role)}
      />
    </SectionCard>
  );
}
