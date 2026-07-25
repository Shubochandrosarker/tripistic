import type { Metadata } from "next";
import { Palette, SlidersHorizontal, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "White Labels · Admin",
};

export default async function AdminWhiteLabelsPage() {
  const [whiteLabels, activeCount] = await Promise.all([
    prisma.workspaceWhiteLabel.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { workspace: { select: { name: true, slug: true } } },
    }),
    prisma.workspaceWhiteLabel.count({ where: { status: "active" } }),
  ]);

  return (
    <>
      <PageHeader
        title="White Labels"
        description="Custom branding coverage for login, email, PDF, public booking pages, and API identity."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={SlidersHorizontal} label="Brand kits" value={String(whiteLabels.length)} hint="Workspace branding records" />
        <MetricCard icon={Sparkles} label="Active brands" value={String(activeCount)} hint="Live white-label tenants" />
        <MetricCard icon={Palette} label="Brand surfaces" value="5" hint="Login, email, PDF, public, API" />
      </div>

      <SectionCard title="Coverage Map">
        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-5">
          <p>Login branding</p>
          <p>Email sender and layout</p>
          <p>PDF itinerary footer</p>
          <p>Public booking styling</p>
          <p>API response brand name</p>
        </div>
      </SectionCard>

      <TableShell
        headers={["Brand", "Organization", "Colors", "Support", "Status", "Updated"]}
        isEmpty={whiteLabels.length === 0}
        emptyMessage="No white-label brands configured yet."
      >
        {whiteLabels.map((brand) => (
          <tr key={brand.id}>
            <Td>
              <span className="font-medium">{brand.brandName}</span>
              <span className="block text-xs text-muted-foreground">{brand.apiBrandName ?? "Default API brand"}</span>
            </Td>
            <Td>
              <span>{brand.workspace.name}</span>
              <span className="block text-xs text-muted-foreground">/{brand.workspace.slug}</span>
            </Td>
            <Td>
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-4 rounded border border-border" style={{ backgroundColor: brand.primaryColor }} />
                <span className="size-4 rounded border border-border" style={{ backgroundColor: brand.accentColor }} />
                {brand.primaryColor}
              </span>
            </Td>
            <Td className="text-muted-foreground">{brand.supportEmail ?? "Not set"}</Td>
            <Td>
              <StatusBadge status={brand.status} />
            </Td>
            <Td className="text-muted-foreground">{formatDateTime(brand.updatedAt)}</Td>
          </tr>
        ))}
      </TableShell>
    </>
  );
}
