import type { Metadata } from "next";
import { Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SectionIntro } from "@/components/marketing/marketing-sections";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Contact · Tripistic",
  description: "Contact Tripistic for sales, support, partnerships, media, and general inquiries.",
};

export default function ContactPage() {
  const reasons = ["Sales", "Support", "Partnership", "Media", "General Inquiry"];
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro eyebrow="Contact" title="Talk with Tripistic." description="Reach the team for sales, support, partnerships, media, or general questions." />
          <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_.85fr]">
            <form className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="name"><Input id="name" name="name" placeholder="Your name" /></Field>
                <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" placeholder="you@example.com" /></Field>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Company" htmlFor="company"><Input id="company" name="company" placeholder="Company name" /></Field>
                <Field label="Inquiry type" htmlFor="reason">
                  <select id="reason" name="reason" className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground">
                    {reasons.map((reason) => <option key={reason}>{reason}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Message" htmlFor="message" hint="This static form is ready for a backend submission handler.">
                <textarea id="message" name="message" rows={6} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground" placeholder="Tell us what you want to build with Tripistic." />
              </Field>
              <Button type="button" className="mt-4">Send message</Button>
            </form>
            <div className="space-y-4">
              {[
                [Mail, "Email", "hello@tripistic.com"],
                [Phone, "Sales", "Book a guided platform walkthrough"],
                [MessageSquare, "Support", "Help center and account support"],
              ].map(([Icon, title, text]) => (
                <div key={String(title)} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <Icon className="size-5 text-accent" aria-hidden />
                  <h2 className="mt-4 text-lg font-semibold text-foreground">{title as string}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
                </div>
              ))}
              <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <MapPin className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">Map</h2>
                <div className="mt-3 h-48 rounded-lg border border-border bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,.22),transparent_34%),linear-gradient(135deg,var(--muted),var(--card))] p-4">
                  <div className="flex h-full items-center justify-center rounded-lg border border-border bg-background/70 text-sm text-muted-foreground">
                    Google Map embed area
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}
