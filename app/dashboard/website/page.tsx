import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Globe2, ImageIcon, Layers, Rocket } from "lucide-react";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { getStorefrontForWorkspace } from "@/lib/storefront/service";
import { listMediaAssets } from "@/lib/media/service";
import { formatDate } from "@/lib/utils";
import { StorefrontBuilderForm } from "@/components/storefront/storefront-builder-form";
import { MediaUploadForm } from "@/components/storefront/media-upload-form";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Website",
};

export default async function WebsitePage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const canManage = canManageWorkspace(active.role);
  const [storefrontData, mediaAssets, publicTours] = await Promise.all([
    getStorefrontForWorkspace(active.workspace.id),
    listMediaAssets(active.workspace.id),
    prisma.tour.count({
      where: {
        workspaceId: active.workspace.id,
        status: "active",
        visibility: "public",
        deletedAt: null,
      },
    }),
  ]);

  if (!storefrontData) redirect("/workspaces/new");
  const storefront = storefrontData.storefront;

  return (
    <>
      <PageHeader
        title="Website"
        description="Brand, publish, and maintain the public booking storefront."
        badge={<StatusBadge status={storefront?.status ?? "draft"} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Globe2} label="Public URL" value={`/book/${active.workspace.slug}`} hint="Tripistic subdomain routing comes in the domain phase" />
        <MetricCard icon={ImageIcon} label="Media" value={String(mediaAssets.length)} hint="Workspace-scoped managed assets" />
        <MetricCard icon={Layers} label="Published version" value={String(storefront?.publishedVersion ?? 0)} hint={storefront?.publishedAt ? `Published ${formatDate(storefront.publishedAt)}` : "Not published"} />
        <MetricCard icon={Rocket} label="Public tours" value={String(publicTours)} hint="Active and visible experiences" />
      </div>

      <SectionCard
        title="Builder"
        description="Save a draft, then publish a versioned snapshot when the storefront is ready."
      >
        <StorefrontBuilderForm
          workspaceId={active.workspace.id}
          workspaceSlug={active.workspace.slug}
          draft={storefrontData.draft}
          media={mediaAssets.map((asset) => ({
            id: asset.id,
            url: asset.url,
            altText: asset.altText,
            status: asset.status,
          }))}
          canManage={canManage}
        />
      </SectionCard>

      <SectionCard
        title="Media Library"
        description="Images are stored under workspace-prefixed keys and require alt text."
      >
        <div className="space-y-4">
          <MediaUploadForm workspaceId={active.workspace.id} canManage={canManage} />
          <TableShell
            headers={["Image", "Alt text", "Status", "Size", "Uploaded"]}
            isEmpty={mediaAssets.length === 0}
            emptyMessage="No media assets uploaded yet."
          >
            {mediaAssets.map((asset) => (
              <tr key={asset.id}>
                <Td>
                  {/* eslint-disable-next-line @next/next/no-img-element -- workspace media is managed through configured object storage. */}
                  <img src={asset.url} alt="" className="h-12 w-20 rounded-md object-cover" />
                </Td>
                <Td className="max-w-sm text-muted-foreground">{asset.altText}</Td>
                <Td>
                  <StatusBadge status={asset.status} />
                </Td>
                <Td className="text-muted-foreground">{Math.round(asset.byteSize / 1024)} KB</Td>
                <Td className="text-muted-foreground">{formatDate(asset.uploadedAt ?? asset.createdAt)}</Td>
              </tr>
            ))}
          </TableShell>
        </div>
      </SectionCard>

      <SectionCard title="Revision History" description="Published storefront versions are immutable.">
        <TableShell
          headers={["Version", "Note", "Published"]}
          isEmpty={!storefrontData.storefront || storefrontData.storefront.revisions.length === 0}
          emptyMessage="No published revisions yet."
        >
          {storefrontData.storefront?.revisions.map((revision) => (
            <tr key={revision.id}>
              <Td>v{revision.versionNumber}</Td>
              <Td className="text-muted-foreground">{revision.note ?? "Published"}</Td>
              <Td className="text-muted-foreground">{formatDate(revision.createdAt)}</Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>
    </>
  );
}
