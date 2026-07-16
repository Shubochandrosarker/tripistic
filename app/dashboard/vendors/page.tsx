import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Handshake } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageVendors, canViewVendors } from "@/lib/auth/permissions";
import { listVendors } from "@/lib/vendors/service";
import { VENDOR_KIND_LABELS, type VendorKindValue } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TableShell, Td } from "@/components/ui/table-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { VendorCreateForm } from "@/components/vendors/vendor-form";

export const metadata: Metadata = { title: "Vendors" };

export default async function VendorsPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewVendors(active.role)) notFound();

  const { vendors, total } = await listVendors(active.workspace.id, {
    search: undefined,
    page: 1,
    pageSize: 100,
  });
  const manage = canManageVendors(active.role);

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Hotels, restaurants, transport, and activity providers you work with — track commission, rating, and invoices."
        actions={manage ? <VendorCreateForm workspaceId={active.workspace.id} /> : null}
      />

      {total === 0 ? (
        <EmptyState icon={Handshake} title="No vendors yet" description="Add a hotel, restaurant, or activity provider to start tracking invoices and ratings." />
      ) : (
        <TableShell headers={["Name", "Type", "Contact", "Rating", "Invoices", "Status"]}>
          {vendors.map((v) => (
            <tr key={v.id} className="transition-colors hover:bg-muted/50">
              <Td>
                <Link href={`/dashboard/vendors/${v.id}`} className="font-medium text-foreground hover:text-accent">
                  {v.name}
                </Link>
              </Td>
              <Td className="text-muted-foreground">{VENDOR_KIND_LABELS[v.kind as VendorKindValue]}</Td>
              <Td className="text-muted-foreground">{v.email ?? v.contactName ?? "—"}</Td>
              <Td className="text-muted-foreground">{v.rating ? `${v.rating}/5` : "—"}</Td>
              <Td className="text-muted-foreground">{v._count.invoices}</Td>
              <Td>
                <StatusBadge status={v.isActive ? "active" : "inactive"} />
              </Td>
            </tr>
          ))}
        </TableShell>
      )}
    </>
  );
}
