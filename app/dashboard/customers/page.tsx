import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canViewCustomers } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { customerListQuerySchema } from "@/lib/validation";
import { buildCustomerListQuery } from "@/lib/customers/query";
import { serializeCustomerListItem } from "@/lib/customers/serializers";
import { CONSENT_STATUSES, CONSENT_STATUS_LABELS } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";
import { Select } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Customers",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewCustomers(active.role)) notFound();

  const raw = await searchParams;
  const parsedQuery = customerListQuerySchema.safeParse({
    consentStatus: firstValue(raw.consentStatus) || undefined,
    search: firstValue(raw.search) || undefined,
    page: firstValue(raw.page) || undefined,
  });
  const query = parsedQuery.success ? parsedQuery.data : customerListQuerySchema.parse({});

  const { where, orderBy, skip, take } = buildCustomerListQuery(active.workspace.id, query);

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy, skip, take, include: { _count: { select: { bookings: true } } } }),
    prisma.customer.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  function pageHref(page: number) {
    const params = new URLSearchParams();
    if (query.consentStatus) params.set("consentStatus", query.consentStatus);
    if (query.search) params.set("search", query.search);
    params.set("page", String(page));
    return `/dashboard/customers?${params.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description="Every guest who has booked with you, deduped by email — profile, history, tags, and marketing consent in one place."
      />

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-[180px] flex-1 sm:flex-none">
          <label htmlFor="search" className="mb-1 block text-xs font-medium text-muted-foreground">
            Search
          </label>
          <input
            id="search"
            name="search"
            defaultValue={query.search ?? ""}
            placeholder="Name, email, or phone"
            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div>
          <label htmlFor="consentStatus" className="mb-1 block text-xs font-medium text-muted-foreground">
            Consent
          </label>
          <Select id="consentStatus" name="consentStatus" defaultValue={query.consentStatus ?? ""}>
            <option value="">All</option>
            {CONSENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CONSENT_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Filter
        </button>
      </form>

      {customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={total === 0 && !query.search && !query.consentStatus ? "No customers yet" : "No customers match these filters"}
          description={
            total === 0 && !query.search && !query.consentStatus
              ? "Every guest who books a tour — directly or manually — automatically gets a profile here, with their full booking history."
              : "Try a different search term or clear the filters."
          }
        />
      ) : (
        <>
          <TableShell headers={["Name", "Contact", "Bookings", "Tags", "Consent"]}>
            {customers.map((customer) => {
              const item = serializeCustomerListItem(customer, active.role);
              return (
                <tr key={item.id} className="transition-colors hover:bg-muted/50">
                  <Td>
                    <Link href={`/dashboard/customers/${item.id}`} className="font-medium text-foreground hover:text-accent">
                      {item.name}
                    </Link>
                  </Td>
                  <Td className="text-muted-foreground">
                    {item.email ?? "Hidden for your role"}
                    {item.phone ? <span className="block text-xs">{item.phone}</span> : null}
                  </Td>
                  <Td className="text-muted-foreground">{item.bookingCount}</Td>
                  <Td>
                    {item.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={item.consentStatus} label={CONSENT_STATUS_LABELS[item.consentStatus as keyof typeof CONSENT_STATUS_LABELS]} />
                  </Td>
                </tr>
              );
            })}
          </TableShell>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {query.page} of {totalPages} · {total} customer{total === 1 ? "" : "s"}
              </span>
              <div className="flex gap-2">
                {query.page > 1 ? (
                  <Link href={pageHref(query.page - 1)} className="text-accent hover:underline">
                    Previous
                  </Link>
                ) : null}
                {query.page < totalPages ? (
                  <Link href={pageHref(query.page + 1)} className="text-accent hover:underline">
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
