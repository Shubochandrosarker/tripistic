import { redirect } from "next/navigation";

import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { hasFeature } from "@/lib/plans/entitlements";
import { getSite } from "@/lib/sites/service";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { SiteDomainBinder } from "@/components/sites/site-domain-binder";
import { ButtonLink } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";

export default async function SiteDomainPage({ params }: { params: Promise<{ siteId: string }> }) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const workspaceId = active.workspace.id;
  const { siteId } = await params;
  const site = await getSite(workspaceId, siteId);

  if (!(await hasFeature(workspaceId, "custom_domain"))) {
    return (
      <SectionCard title="Custom domain">
        <p className="text-sm text-muted-foreground">
          Custom domains are not included in your current plan. Your website stays reachable at{" "}
          <code className="text-accent">{site.subdomain}.tripistic.site</code>.
        </p>
        <ButtonLink href="/dashboard/billing" className="mt-4">
          See plans
        </ButtonLink>
      </SectionCard>
    );
  }

  const domains = await prisma.customDomain.findMany({
    where: { workspaceId, status: { not: "disabled" } },
    orderBy: { hostname: "asc" },
    select: { id: true, hostname: true, status: true, siteId: true },
  });

  return (
    <SectionCard
      title="Custom domain"
      description="Point a hostname you own at this website. DNS and certificates are handled on the Domains page."
    >
      <SiteDomainBinder
        workspaceId={workspaceId}
        siteId={site.id}
        subdomain={site.subdomain}
        canManage={canManageWorkspace(active.role)}
        domains={domains.map((domain) => ({
          id: domain.id,
          hostname: domain.hostname,
          status: domain.status,
          boundToThisSite: domain.siteId === site.id,
        }))}
      />
    </SectionCard>
  );
}
