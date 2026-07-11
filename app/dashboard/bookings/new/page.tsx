import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageBookings } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { ManualBookingForm } from "@/components/bookings/manual-booking-form";

export const metadata: Metadata = {
  title: "New booking",
};

export default async function NewBookingPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canManageBookings(active.role)) notFound();

  const tours = await prisma.tour.findMany({
    where: { workspaceId: active.workspace.id, status: "active", deletedAt: null },
    orderBy: { title: "asc" },
    select: { id: true, title: true, visibility: true, basePrice: true, currency: true, capacity: true },
  });

  return (
    <>
      <PageHeader title="New booking" description="Create a manual booking for a phone, email, or walk-in guest." />
      <SectionCard>
        <ManualBookingForm workspaceId={active.workspace.id} timezone={active.workspace.timezone} tours={tours} />
      </SectionCard>
    </>
  );
}
