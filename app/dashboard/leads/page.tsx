import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Target } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageCrm, canViewCrm } from "@/lib/auth/permissions";
import { listLeads } from "@/lib/crm/leads";
import { serializeLead } from "@/lib/crm/serializers";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatusValue } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { LeadCreateForm, LeadStatusSelect, ConvertLeadButton } from "@/components/crm/lead-form";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewCrm(active.role)) notFound();

  const { leads, total } = await listLeads(active.workspace.id, {
    search: undefined,
    page: 1,
    pageSize: 200,
  });
  const manage = canManageCrm(active.role);
  const serialized = leads.map(serializeLead);

  const byStatus = new Map<LeadStatusValue, typeof serialized>();
  for (const status of LEAD_STATUSES) byStatus.set(status, []);
  for (const lead of serialized) {
    byStatus.get(lead.status as LeadStatusValue)?.push(lead);
  }

  return (
    <>
      <PageHeader
        title="Leads"
        description="Your pipeline of prospective guests — from first contact through to a confirmed customer."
        actions={manage ? <LeadCreateForm workspaceId={active.workspace.id} /> : null}
      />

      {total === 0 ? (
        <EmptyState
          icon={Target}
          title="No leads yet"
          description="Add a prospective guest to start tracking them through your pipeline."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {LEAD_STATUSES.map((status) => {
            const items = byStatus.get(status) ?? [];
            return (
              <SectionCard
                key={status}
                title={LEAD_STATUS_LABELS[status]}
                description={`${items.length} lead${items.length === 1 ? "" : "s"}`}
                className="lg:col-span-1"
              >
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Empty</p>
                ) : (
                  <ul className="space-y-3">
                    {items.map((lead) => (
                      <li key={lead.id} className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                        <p className="font-medium text-foreground">{lead.name}</p>
                        {lead.email ? <p className="truncate text-xs text-muted-foreground">{lead.email}</p> : null}
                        {lead.company ? (
                          <Link href="/dashboard/companies" className="text-xs text-accent hover:underline">
                            {lead.company.name}
                          </Link>
                        ) : null}
                        {lead.estimatedValueCents !== null ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatMoney(lead.estimatedValueCents, lead.currency)}
                          </p>
                        ) : null}
                        {lead.convertedCustomer ? (
                          <Link
                            href={`/dashboard/customers/${lead.convertedCustomer.id}`}
                            className="mt-2 block text-xs font-medium text-accent hover:underline"
                          >
                            View customer →
                          </Link>
                        ) : manage ? (
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <LeadStatusSelect workspaceId={active.workspace.id} leadId={lead.id} status={lead.status as LeadStatusValue} />
                            {lead.email && (lead.status === "qualified" || lead.status === "proposal_sent") ? (
                              <ConvertLeadButton workspaceId={active.workspace.id} leadId={lead.id} />
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}
    </>
  );
}
