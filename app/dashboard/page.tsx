import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  CalendarClock,
  CalendarCheck,
  DollarSign,
  Map,
  Rocket,
  Settings,
  Users,
} from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { getWorkspaceSubscription } from "@/lib/plans/limits";
import { prisma } from "@/lib/db";
import { buildOnboardingChecklist, onboardingProgress } from "@/lib/onboarding";
import { daysUntil } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { AIRecommendationCard } from "@/components/dashboard/ai-recommendation-card";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const [subscription, memberCount, tourCount, upcomingSlotCount, bookingCount, upcomingBookingCount, publicBookableTourCount] =
    await Promise.all([
      getWorkspaceSubscription(active.workspace.id),
      prisma.workspaceMember.count({
        where: { workspaceId: active.workspace.id, status: "active" },
      }),
      prisma.tour.count({
        where: { workspaceId: active.workspace.id, deletedAt: null },
      }),
      prisma.availability.count({
        where: {
          workspaceId: active.workspace.id,
          status: "scheduled",
          startsAt: { gt: new Date() },
          tour: { deletedAt: null, status: { not: "archived" } },
        },
      }),
      prisma.booking.count({ where: { workspaceId: active.workspace.id } }),
      prisma.booking.count({
        where: {
          workspaceId: active.workspace.id,
          status: { in: ["pending", "confirmed"] },
          departureStartsAt: { gt: new Date() },
        },
      }),
      prisma.tour.count({
        where: {
          workspaceId: active.workspace.id,
          status: "active",
          visibility: "public",
          deletedAt: null,
          availabilities: { some: { status: "scheduled", startsAt: { gt: new Date() } } },
        },
      }),
    ]);

  const checklist = buildOnboardingChecklist({
    hasWorkspace: true,
    memberCount,
    tourCount,
    upcomingSlotCount,
    hasPublicBookableTour: publicBookableTourCount > 0,
  });
  const progress = onboardingProgress(checklist);
  const trialDays = daysUntil(subscription?.trialEndsAt ?? null);

  return (
    <>
      <PageHeader
        title={active.workspace.name}
        description={`Welcome back, ${user.name.split(" ")[0]}. Here's where your tour business stands.`}
        badge={
          subscription ? (
            <StatusBadge
              status={subscription.status}
              label={
                subscription.status === "trialing" && trialDays !== null
                  ? `Trial · ${trialDays}d left`
                  : undefined
              }
            />
          ) : null
        }
        actions={
          <ButtonLink href="/dashboard/onboarding" variant="secondary" size="sm">
            <Rocket className="size-3.5" aria-hidden /> Continue setup
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CalendarCheck}
          label="Total bookings"
          value={String(bookingCount)}
          hint={
            bookingCount === 0
              ? "Publish a tour to start taking direct bookings"
              : `${upcomingBookingCount} upcoming`
          }
        />
        <MetricCard icon={DollarSign} label="Revenue" value="—" pendingPhase="Phase 4" />
        <MetricCard
          icon={CalendarClock}
          label="Upcoming departures"
          value={String(upcomingSlotCount)}
          hint={
            upcomingSlotCount === 0
              ? "Add a tour schedule to open your calendar"
              : `Across ${tourCount} tour${tourCount === 1 ? "" : "s"}`
          }
        />
        <MetricCard
          icon={Users}
          label="Team members"
          value={String(memberCount)}
          hint="Active members in this workspace"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard
          title="Setup progress"
          description={`${progress.done} of ${progress.total} steps complete`}
          className="lg:col-span-3"
          actions={
            <span className="text-sm font-semibold text-accent">{progress.percent}%</span>
          }
        >
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <SetupChecklist items={checklist} compact />
        </SectionCard>

        <div className="space-y-4 lg:col-span-2">
          <AIRecommendationCard />
          <SectionCard title="Quick links">
            <div className="grid grid-cols-2 gap-2">
              <ButtonLink href="/dashboard/tours" variant="secondary" size="sm">
                <Map className="size-3.5" aria-hidden /> Tours
              </ButtonLink>
              <ButtonLink href="/dashboard/bookings" variant="secondary" size="sm">
                <CalendarCheck className="size-3.5" aria-hidden /> Bookings
              </ButtonLink>
              <ButtonLink href="/dashboard/settings" variant="secondary" size="sm">
                <Settings className="size-3.5" aria-hidden /> Settings
              </ButtonLink>
              <ButtonLink href="/dashboard/settings#members" variant="secondary" size="sm">
                <Users className="size-3.5" aria-hidden /> Invite team
              </ButtonLink>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
