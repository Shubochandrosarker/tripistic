import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { comparisonRows } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Why Tripistic · Comparison",
  description: "Compare Tripistic with Tourflows, Rezdy, FareHarbor, Checkfront, and WeTravel across AI, white label, CRM, operations, automation, analytics, and pricing.",
};

const headers = ["Capability", "Tripistic", "Tourflows", "Rezdy", "FareHarbor", "Checkfront", "WeTravel"];

export default function WhyTripisticPage() {
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Why Tripistic"
            title="Built as an operating system, not a booking plug-in."
            description="Most travel tools solve one slice of the business. Tripistic connects bookings, CRM, operations, AI, analytics, white label, and enterprise administration."
          />
          <div className="mt-10 overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/70">
                <tr>
                  {headers.map((header) => (
                    <th key={header} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparisonRows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) => (
                      <td key={`${row[0]}-${index}`} className="px-4 py-3 text-foreground">
                        <span className={index === 1 ? "inline-flex items-center gap-2 font-semibold text-accent" : "text-muted-foreground"}>
                          {index === 1 ? <Check className="size-4" aria-hidden /> : index > 1 && cell === "No" ? <Minus className="size-4" aria-hidden /> : null}
                          {cell}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <CtaBand title="Choose the platform built for where travel operations are going." />
    </MarketingShell>
  );
}
