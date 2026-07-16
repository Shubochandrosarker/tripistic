import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageVendors, canViewVendors } from "@/lib/auth/permissions";
import { requireVendor, listVendorInvoices } from "@/lib/vendors/service";
import { VENDOR_INVOICE_STATUS_LABELS, VENDOR_KIND_LABELS, type VendorInvoiceStatusValue, type VendorKindValue } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";
import { InvoiceCreateForm, MarkInvoicePaidButton } from "@/components/vendors/vendor-form";

type Params = { params: Promise<{ vendorId: string }> };

export const metadata: Metadata = { title: "Vendor" };

export default async function VendorDetailPage({ params }: Params) {
  const { vendorId } = await params;
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewVendors(active.role)) notFound();

  const vendor = await requireVendor(active.workspace.id, vendorId).catch(() => null);
  if (!vendor) notFound();

  const { invoices, total } = await listVendorInvoices(active.workspace.id, vendorId, { page: 1, pageSize: 100 });
  const manage = canManageVendors(active.role);

  return (
    <>
      <PageHeader
        title={vendor.name}
        description={`${VENDOR_KIND_LABELS[vendor.kind as VendorKindValue]}${vendor.contactName ? ` · ${vendor.contactName}` : ""}`}
        badge={<StatusBadge status={vendor.isActive ? "active" : "inactive"} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Invoices">
            {total === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices recorded yet.</p>
            ) : (
              <TableShell headers={["Invoice", "Issued", "Due", "Amount", "Status", ...(manage ? ["Actions"] : [])]}>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="transition-colors hover:bg-muted/50">
                    <Td className="text-foreground">{inv.invoiceNumber ?? "—"}</Td>
                    <Td className="text-muted-foreground">{formatDate(inv.issuedOn)}</Td>
                    <Td className="text-muted-foreground">{inv.dueOn ? formatDate(inv.dueOn) : "—"}</Td>
                    <Td className="text-muted-foreground">{formatMoney(inv.amountCents, inv.currency)}</Td>
                    <Td>
                      <StatusBadge status={inv.status} label={VENDOR_INVOICE_STATUS_LABELS[inv.status as VendorInvoiceStatusValue]} />
                    </Td>
                    {manage ? (
                      <Td>
                        <MarkInvoicePaidButton workspaceId={active.workspace.id} vendorId={vendorId} invoiceId={inv.id} status={inv.status} />
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </TableShell>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          {manage ? (
            <SectionCard title="Log invoice">
              <InvoiceCreateForm workspaceId={active.workspace.id} vendorId={vendorId} />
            </SectionCard>
          ) : null}
          <SectionCard title="Details">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Email</dt>
                <dd className="text-foreground">{vendor.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Phone</dt>
                <dd className="text-foreground">{vendor.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Country</dt>
                <dd className="text-foreground">{vendor.country ?? "—"}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Commission</dt>
                <dd className="text-foreground">{vendor.commissionRateBps !== null ? `${(vendor.commissionRateBps / 100).toFixed(2)}%` : "—"}</dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
