import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageCrm, canViewCrm } from "@/lib/auth/permissions";
import { listCompanies } from "@/lib/crm/companies";
import { serializeCompany } from "@/lib/crm/serializers";
import { COMPANY_KIND_LABELS, type CompanyKindValue } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TableShell, Td } from "@/components/ui/table-shell";
import { CompanyCreateForm, ArchiveCompanyButton } from "@/components/crm/company-form";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewCrm(active.role)) notFound();

  const { companies, total } = await listCompanies(active.workspace.id, {
    search: undefined,
    page: 1,
    pageSize: 100,
  });
  const manage = canManageCrm(active.role);

  return (
    <>
      <PageHeader
        title="Companies"
        description="Travel agents, hotels, and other partners your workspace deals with — link customers and leads to them for commission and relationship tracking."
        actions={manage ? <CompanyCreateForm workspaceId={active.workspace.id} /> : null}
      />

      {total === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies yet"
          description="Add a travel agent, hotel, or partner to start linking customers and leads to them."
        />
      ) : (
        <TableShell headers={["Name", "Type", "Contact", "Customers", "Leads", ...(manage ? ["Actions"] : [])]}>
          {companies.map((c) => {
            const item = serializeCompany(c);
            return (
              <tr key={item.id} className="transition-colors hover:bg-muted/50">
                <Td className="font-medium">{item.name}</Td>
                <Td className="text-muted-foreground">{COMPANY_KIND_LABELS[item.kind as CompanyKindValue]}</Td>
                <Td className="text-muted-foreground">
                  {item.email ?? "—"}
                  {item.phone ? <span className="block text-xs">{item.phone}</span> : null}
                </Td>
                <Td className="text-muted-foreground">{item.customerCount}</Td>
                <Td className="text-muted-foreground">{item.leadCount}</Td>
                {manage ? (
                  <Td>
                    <ArchiveCompanyButton workspaceId={active.workspace.id} companyId={item.id} name={item.name} />
                  </Td>
                ) : null}
              </tr>
            );
          })}
        </TableShell>
      )}
    </>
  );
}
