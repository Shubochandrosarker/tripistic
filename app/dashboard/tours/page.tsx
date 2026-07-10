import type { Metadata } from "next";
import { Map } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Tours",
};

export default function ToursPage() {
  return (
    <>
      <PageHeader
        title="Tours"
        description="Your tour products, availability, capacity, and pricing will live here."
      />
      <EmptyState
        icon={Map}
        phase="Arriving in Phase 2"
        title="Tour management is coming next"
        description="You'll create tours, activities, and packages with schedules, capacity rules, blackout dates, pricing, and add-ons. This is the very next module on the roadmap — everything you set up in Phase 1 carries over."
        actions={
          <>
            <ButtonLink href="/dashboard/onboarding" variant="primary" size="sm">
              Prepare tour setup
            </ButtonLink>
            <ButtonLink href="/dashboard/settings" variant="secondary" size="sm">
              Review workspace settings
            </ButtonLink>
          </>
        }
        footnote="Tip: gather your tour titles, durations, meeting points, and prices now so setup takes minutes later."
      />
    </>
  );
}
