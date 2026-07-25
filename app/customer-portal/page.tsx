import { Bell, CreditCard, FileText, ListTree, MessageSquare, Smartphone } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/customer-portal";
const TITLE = "Customer Portal";
const DESCRIPTION =
  "Give travellers a branded portal for bookings, invoices, documents, payments, messaging, trip timeline, and notifications — on any device.";

export const metadata = buildMetadata({
  title: "Customer Portal · Branded guest self-service",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Guest experience",
  keywords: [
    "traveller portal",
    "guest self service travel",
    "booking portal software",
  ],
});

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
      <JsonLd
        schema={[webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH })]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: TITLE, href: PATH }]} />
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
