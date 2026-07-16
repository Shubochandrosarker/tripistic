import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageItineraries, canViewItineraries } from "@/lib/auth/permissions";
import { listItineraries } from "@/lib/itinerary/service";
import { ITINERARY_STATUS_LABELS, type ItineraryStatusValue } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TableShell, Td } from "@/components/ui/table-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { ItineraryGenerateForm } from "@/components/itineraries/itinerary-generate-form";

export const metadata: Metadata = { title: "Itineraries" };

export default async function ItinerariesPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewItineraries(active.role)) notFound();

  const { itineraries, total } = await listItineraries(active.workspace.id, {
    search: undefined,
    page: 1,
    pageSize: 100,
  });
  const manage = canManageItineraries(active.role);

  return (
    <>
      <PageHeader
        title="Itineraries"
        description="AI-built, fully editable day-by-day trip proposals — with pricing, margin, and a shareable customer link."
        actions={manage ? <ItineraryGenerateForm workspaceId={active.workspace.id} /> : null}
      />

      {total === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No itineraries yet"
          description='Describe a trip — like "9 Day Laos Tour" — and generate a full day-by-day plan from your own tour catalog and vendors.'
        />
      ) : (
        <TableShell headers={["Title", "Destination", "Days", "Items", "Customer", "Status"]}>
          {itineraries.map((it) => (
            <tr key={it.id} className="transition-colors hover:bg-muted/50">
              <Td>
                <Link href={`/dashboard/itineraries/${it.id}`} className="font-medium text-foreground hover:text-accent">
                  {it.title}
                </Link>
              </Td>
              <Td className="text-muted-foreground">{it.destination ?? "—"}</Td>
              <Td className="text-muted-foreground">{it.dayCount}</Td>
              <Td className="text-muted-foreground">{it._count.items}</Td>
              <Td className="text-muted-foreground">{it.customer?.name ?? "—"}</Td>
              <Td>
                <StatusBadge status={it.status} label={ITINERARY_STATUS_LABELS[it.status as ItineraryStatusValue]} />
              </Td>
            </tr>
          ))}
        </TableShell>
      )}
    </>
  );
}
