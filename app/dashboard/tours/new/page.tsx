import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { TourForm } from "@/components/tours/tour-form";

export const metadata: Metadata = {
  title: "New tour",
};

export default async function NewTourPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canManageTours(active.role)) notFound();

  return (
    <>
      <PageHeader
        title="New tour"
        description="Create a tour, activity, or multi-day package. You'll add schedules and departures on the next screen."
      />
      <SectionCard>
        <TourForm
          workspaceId={active.workspace.id}
          defaultCurrency={active.workspace.currency}
        />
      </SectionCard>
    </>
  );
}
