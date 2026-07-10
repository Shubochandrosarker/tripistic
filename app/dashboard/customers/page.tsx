import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Customers",
};

export default function CustomersPage() {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Guest profiles, booking history, notes, tags, and consent will be tracked here."
      />
      <EmptyState
        icon={Users}
        phase="Arriving in Phase 5"
        title="Customer CRM is coming in Phase 5"
        description="Once bookings are live, every guest automatically gets a profile with booking history, communication timeline, notes, tags, and marketing consent status — so repeat customers and group leaders are never lost in a spreadsheet again."
        actions={
          <ButtonLink href="/dashboard/onboarding" variant="secondary" size="sm">
            View the roadmap on onboarding
          </ButtonLink>
        }
        footnote="Automated confirmations, reminders, and review requests arrive in the same phase."
      />
    </>
  );
}
