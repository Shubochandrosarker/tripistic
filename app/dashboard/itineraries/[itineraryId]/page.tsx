import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Copy, DollarSign, Percent, TrendingUp } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageItineraries, canViewItineraries } from "@/lib/auth/permissions";
import { requireItinerary } from "@/lib/itinerary/service";
import { serializeItinerary } from "@/lib/itinerary/serializers";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
  ItineraryBuilder,
  SaveVersionButton,
  ItineraryStatusControl,
} from "@/components/itineraries/itinerary-builder";

type Params = { params: Promise<{ itineraryId: string }> };

export const metadata: Metadata = { title: "Itinerary" };

export default async function ItineraryDetailPage({ params }: Params) {
  const { itineraryId } = await params;
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewItineraries(active.role)) notFound();

  const record = await requireItinerary(active.workspace.id, itineraryId).catch(() => null);
  if (!record) notFound();

  const itinerary = serializeItinerary(record);
  const manage = canManageItineraries(active.role);
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/itinerary/${itinerary.publicToken}`;

  return (
    <>
      <PageHeader
        title={itinerary.title}
        description={itinerary.destination ? `${itinerary.destination} · ${itinerary.dayCount} days` : `${itinerary.dayCount} days`}
        actions={
          manage ? (
            <div className="flex items-center gap-2">
              <ItineraryStatusControl workspaceId={active.workspace.id} itineraryId={itineraryId} status={itinerary.status} />
              <SaveVersionButton workspaceId={active.workspace.id} itineraryId={itineraryId} />
            </div>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={DollarSign} label="Total cost" value={formatMoney(itinerary.totalCostCents, itinerary.currency)} />
        <MetricCard icon={TrendingUp} label="Total price" value={formatMoney(itinerary.totalPriceCents, itinerary.currency)} />
        <MetricCard icon={Percent} label="Margin" value={`${itinerary.marginPct}%`} hint={formatMoney(itinerary.marginCents, itinerary.currency)} />
      </div>

      <SectionCard
        title="Share link"
        description="A read-only, print-friendly view of this itinerary for your customer."
        actions={
          <a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
            <Copy className="size-3.5" aria-hidden /> Open
          </a>
        }
      >
        <code className="block truncate rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{shareUrl}</code>
      </SectionCard>

      <ItineraryBuilder
        workspaceId={active.workspace.id}
        itineraryId={itineraryId}
        days={itinerary.days}
        currency={itinerary.currency}
        canManage={manage}
      />
    </>
  );
}
