import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe2, Layers } from "lucide-react";

import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { hasFeature } from "@/lib/plans/entitlements";
import { listSites, listTemplatesForWorkspace } from "@/lib/sites/service";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { formatDate } from "@/lib/utils";
import { SiteCreateForm } from "@/components/sites/site-create-form";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Site Builder",
  description: "Build and publish a branded website backed by your live tours.",
};

export default async function SitesPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const workspaceId = active.workspace.id;
  const canManage = canManageWorkspace(active.role);

  if (!(await hasFeature(workspaceId, "storefront_builder"))) {
    return (
      <>
        <PageHeader
          title="Site Builder"
          description="A branded website on your own domain, backed by the tours you already manage."
        />
        <EmptyState
          icon={Layers}
          title="The Site Builder is not included in your current plan"
          description="Upgrade to build a multi-page website from templates, connect a custom domain, and publish it to the edge in seconds."
          actions={<ButtonLink href="/dashboard/billing">See plans</ButtonLink>}
        />
      </>
    );
  }

  const [sites, templates] = await Promise.all([
    listSites(workspaceId),
    listTemplatesForWorkspace(workspaceId),
  ]);

  return (
    <>
      <PageHeader
        title="Site Builder"
        description="Pages, brand and SEO in one place. Tour prices and availability stay in sync automatically."
      />

      {sites.length === 0 ? (
        <SectionCard
          title="Create your first website"
          description="Pick a starting point. Every template is a full set of pages you can edit — nothing is locked."
        >
          {canManage ? (
            <SiteCreateForm workspaceId={workspaceId} templates={templates} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Only workspace owners and admins can create a website.
            </p>
          )}
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Your websites">
            <TableShell
              headers={["Website", "Address", "Status", "Pages", "Last deployment"]}
              isEmpty={false}
            >
              {sites.map((site) => {
                const deployment = site.deployments[0];
                const domain = site.domains[0];
                return (
                  <tr key={site.id}>
                    <Td>
                      <Link
                        href={`/dashboard/sites/${site.id}`}
                        className="font-medium text-foreground hover:text-accent"
                      >
                        {site.name}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Globe2 aria-hidden className="h-3.5 w-3.5" />
                        {domain?.hostname ?? `${site.subdomain}.tripistic.site`}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={site.status} />
                    </Td>
                    <Td className="text-muted-foreground">{site._count.pages}</Td>
                    <Td className="text-muted-foreground">
                      {deployment ? `${deployment.status} · ${formatDate(deployment.createdAt)}` : "Never published"}
                    </Td>
                  </tr>
                );
              })}
            </TableShell>
          </SectionCard>

          {canManage ? (
            <SectionCard
              title="Add another website"
              description="Useful when you run more than one brand from the same workspace."
            >
              <SiteCreateForm workspaceId={workspaceId} templates={templates} />
            </SectionCard>
          ) : null}
        </>
      )}
    </>
  );
}
