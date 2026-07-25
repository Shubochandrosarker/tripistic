import type { Metadata } from "next";
import { Calculator, Check, Sparkles } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pricing · Tripistic",
  description: "Tripistic pricing for solo guides, operators, agencies, and enterprise travel platforms.",
};

const plans = [
  ["Solo", "$49", "For independent guides launching direct bookings.", ["Direct booking pages", "Tours and availability", "Stripe payments", "Digital waivers"]],
  ["Operator", "$149", "For teams running daily departures and staff.", ["Everything in Solo", "CRM and tasks", "Operations center", "Guides and vehicles"]],
  ["Agency", "$399", "For agencies and DMCs building itineraries and partner workflows.", ["AI itinerary builder", "Vendors and invoices", "Customer portal", "Advanced analytics"]],
  ["Enterprise", "Custom", "For white-label, custom domains, and platform administration.", ["Super admin", "White label", "Custom domains", "AI provider governance"]],
] as const;

export default function PricingPage() {
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Pricing"
            title="Simple plans for operators. Enterprise power when you need it."
            description="Choose monthly or yearly, start with the workflows you need today, and grow into AI itineraries, white label, custom domains, and platform administration."
          />
          <div className="mx-auto mt-8 flex w-fit rounded-lg border border-border bg-card p-1">
            <span className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground">Monthly</span>
            <span className="px-4 py-2 text-sm text-muted-foreground">Yearly · save 20%</span>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {plans.map(([name, price, summary, features], index) => (
              <div key={name} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                {index === 1 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                    <Sparkles className="size-3.5" aria-hidden /> Most popular
                  </span>
                ) : null}
                <h2 className="mt-4 text-xl font-semibold text-foreground">{name}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{summary}</p>
                <p className="mt-5 text-3xl font-semibold text-foreground">
                  {price}
                  {price.startsWith("$") ? <span className="text-sm font-normal text-muted-foreground">/mo</span> : null}
                </p>
                <ButtonLink href={name === "Enterprise" ? "/contact" : "/register"} className="mt-5 w-full">
                  {name === "Enterprise" ? "Contact sales" : "Start free"}
                </ButtonLink>
                <ul className="mt-5 space-y-3">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 text-accent" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Calculator className="size-5 text-accent" aria-hidden />
                <h2 className="mt-3 text-2xl font-semibold text-foreground">ROI calculator</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  If Tripistic helps you shift only 20 bookings a month from marketplace or manual channels to direct booking, the platform can pay for itself quickly through saved commission and admin time.
                </p>
              </div>
              <ButtonLink href="/contact" variant="secondary">Calculate with sales</ButtonLink>
            </div>
          </div>
        </div>
      </main>
      <CtaBand title="Upgrade from booking software to a travel operating system." />
    </MarketingShell>
  );
}
