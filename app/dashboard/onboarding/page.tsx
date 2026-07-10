import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { prisma } from "@/lib/db";
import { buildOnboardingChecklist, onboardingProgress } from "@/lib/onboarding";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";

export const metadata: Metadata = {
  title: "Onboarding",
};

export default async function OnboardingPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const [memberCount, tourCount, upcomingSlotCount] = await Promise.all([
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
        tour: { deletedAt: null },
      },
    }),
  ]);

  const checklist = buildOnboardingChecklist({
    hasWorkspace: true,
    memberCount,
    tourCount,
    upcomingSlotCount,
  });
  const progress = onboardingProgress(checklist);

  return (
    <>
      <PageHeader
        title="Get set up"
        description="Work through these steps to go from empty workspace to taking direct bookings. Steps marked with a phase unlock as those modules ship."
      />

      <SectionCard
        title="Setup checklist"
        description={`${progress.done} of ${progress.total} complete — ${progress.percent}%`}
      >
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <SetupChecklist items={checklist} />
      </SectionCard>

      <SectionCard title="What happens next?">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">
              Tours & availability — live now:
            </span>{" "}
            create your tour products, schedules, and departures from the Tours page.
          </li>
          <li>
            <span className="font-medium text-foreground">Phase 3 — Booking engine:</span> your
            public booking page starts accepting reservations.
          </li>
          <li>
            <span className="font-medium text-foreground">Phase 4 — Stripe payments:</span> take
            full payments and deposits with 0% Tripistic commission.
          </li>
          <li>
            <span className="font-medium text-foreground">Phase 5–7:</span> guest communication,
            waivers, guide manifests, and the AI Growth Dashboard.
          </li>
        </ol>
      </SectionCard>
    </>
  );
}
