import type { Metadata } from "next";
import { Bell, CreditCard, FileText, ListTree, MessageSquare, Smartphone } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "Customer Portal · Tripistic",
  description: "A branded customer portal for bookings, invoices, documents, payments, chat, trip timeline, notifications, and mobile self-service.",
};

export default function CustomerPortalPage() {
  const items = [
    [FileText, "Bookings and documents", "Travelers can find confirmations, documents, waivers, and trip details."],
    [CreditCard, "Invoices and payments", "Expose payment links, receipts, balances, and retry flows in a branded surface."],
    [MessageSquare, "Chat and support", "Give guests a clear communication channel tied back to their booking history."],
    [ListTree, "Trip timeline", "Show itinerary days, transfers, activities, meeting points, and updates."],
    [Bell, "Notifications", "Reminders, delay notices, review requests, and operational changes stay visible."],
    [Smartphone, "Mobile experience", "Designed for travelers checking details on the way to departure."],
  ];
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Customer Portal"
            title="A premium self-service portal for every traveler."
            description="Reduce support load while giving guests a clear branded place for bookings, invoices, documents, payments, chat, timelines, and mobile notifications."
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Icon className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">{title as string}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand title="Give guests a portal that matches the quality of the trip." />
    </MarketingShell>
  );
}
