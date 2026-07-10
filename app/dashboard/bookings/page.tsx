import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Bookings",
};

export default function BookingsPage() {
  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every reservation — direct, manual, and (later) OTA — will be managed here."
      />
      <EmptyState
        icon={CalendarCheck}
        phase="Arriving in Phase 3"
        title="The booking engine is coming in Phase 3"
        description="Set up your tour products and availability first (Phase 2) — then Tripistic starts accepting reservations from your public booking page with real-time availability, guest details, and manual admin bookings. 0% commission on direct bookings, no customer-facing surcharge."
        actions={
          <>
            <ButtonLink href="/dashboard/tours" variant="primary" size="sm">
              Set up tours first
            </ButtonLink>
            <ButtonLink href="/dashboard/onboarding" variant="secondary" size="sm">
              View setup checklist
            </ButtonLink>
          </>
        }
        footnote="Stripe payments with deposits and installments follow in Phase 4."
      />
    </>
  );
}
