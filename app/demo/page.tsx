import type { Metadata } from "next";
import { CirclePlay, MousePointer2, Video } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, ProductPreview, SectionIntro } from "@/components/marketing/marketing-sections";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Demo · Tripistic",
  description: "Explore the Tripistic dashboard, AI workflows, operations center, bookings, CRM, and white-label platform in an interactive product overview.",
};

export default function DemoPage() {
  const steps = ["Dashboard overview", "Create a tour", "Open bookings", "Assign guide and vehicle", "Generate AI itinerary", "Review analytics"];
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Interactive demo"
            title="Walk through the product before your first booking."
            description="Preview the operating rhythm of Tripistic: dashboard health, booking workflows, live operations, AI itineraries, and admin controls."
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_.65fr]">
            <ProductPreview />
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <CirclePlay className="size-6 text-accent" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold text-foreground">Feature walkthrough</h2>
              <div className="mt-5 space-y-2">
                {steps.map((step, index) => (
                  <div key={step} className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
                    <span className="flex size-6 items-center justify-center rounded-full bg-card text-xs font-semibold text-foreground">{index + 1}</span>
                    <span className="text-muted-foreground">{step}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex gap-3">
                <ButtonLink href="/contact">Book a demo</ButtonLink>
                <ButtonLink href="/register" variant="secondary">Try free</ButtonLink>
              </div>
            </div>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [Video, "Videos", "Short product tours for operators, admins, and agencies."],
              [MousePointer2, "Hotspots", "Interactive callouts explain the core dashboard surfaces."],
              [CirclePlay, "Guided flow", "See how a request becomes an itinerary, booking, operation, and report."],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Icon className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">{title as string}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand title="See Tripistic with your own operating model." />
    </MarketingShell>
  );
}
