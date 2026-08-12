import { notFound, redirect } from "next/navigation";

import { requireUserPage } from "@/lib/auth/session";
import { hasFeature } from "@/lib/plans/entitlements";
import { getSite } from "@/lib/sites/service";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { SiteTabs } from "@/components/sites/site-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

/**
 * Shared chrome for one website.
 *
 * The site is loaded here so every tab shares one tenant-scoped lookup —
 * `getSite` filters on `{ id, workspaceId }`, so a site id belonging to another
 * workspace 404s at the layout and no child page ever runs. Putting that check
 * in each tab instead would make it a thing to remember.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!(await hasFeature(active.workspace.id, "storefront_builder"))) redirect("/dashboard/sites");

  const { siteId } = await params;
  const site = await getSite(active.workspace.id, siteId).catch(() => null);
  if (!site) notFound();

  return (
    <>
      <PageHeader
        title={site.name}
        description={`${site.subdomain}.tripistic.site · ${site.pages.length} pages`}
        badge={<StatusBadge status={site.status} />}
      />
      <SiteTabs siteId={site.id} />
      {children}
    </>
  );
}
