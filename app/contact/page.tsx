import Link from "next/link";
import { Handshake, Headphones, Mail, MapPin, Megaphone, Phone } from "lucide-react";

import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { ContactForm } from "@/components/marketing/contact-form";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SectionIntro } from "@/components/marketing/marketing-sections";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";

const PATH = "/contact";
const TITLE = "Contact";
const DESCRIPTION =
  "Talk to Tripistic about sales, support, partnerships, media, or general questions. Response targets by plan, and a real person on the other end.";

export const metadata = buildMetadata({
  title: `${TITLE} · Sales, support, partnerships, and media`,
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Contact",
  keywords: ["contact tripistic", "tour operator software sales", "travel software support"],
});

const CHANNELS = [
  {
    icon: Phone,
    title: "Sales",
    description:
      "Book a 30-minute walkthrough against your own workflows, or ask about migration and enterprise terms.",
    contact: SITE.salesEmail,
  },
  {
    icon: Headphones,
    title: "Support",
    description:
      "Product help for existing customers. Response targets are set by plan in our Service Level Agreement.",
    contact: SITE.supportEmail,
  },
  {
    icon: Handshake,
    title: "Partnerships",
    description:
      "Technology, integration, agency, and affiliate partnerships — including reseller and white-label arrangements.",
    contact: SITE.salesEmail,
  },
  {
    icon: Megaphone,
    title: "Media",
    description: "Press enquiries, product briefings, and commentary on travel technology.",
    contact: SITE.salesEmail,
  },
];

export default function ContactPage() {
  return (
    <MarketingShell>
      <JsonLd schema={[webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH })]} />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: "Contact", href: PATH }]} />
          <SectionIntro
            eyebrow="Contact"
            title="Talk to the team."
            description="Sales, support, partnerships, or media. Tell us what you are trying to solve and we will route it to the right person."
          />

          <div className="mt-12 grid gap-8 lg:grid-cols-[1.15fr_.85fr]">
            <ContactForm />

            <div className="space-y-4">
              {CHANNELS.map((channel) => (
                <div key={channel.title} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <channel.icon className="size-4.5" aria-hidden />
                  </span>
                  <h2 className="mt-4 text-base font-semibold text-foreground">{channel.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {channel.description}
                  </p>
                  <a
                    href={`mailto:${channel.contact}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                  >
                    <Mail className="size-3.5" aria-hidden />
                    {channel.contact}
                  </a>
                </div>
              ))}

              <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <MapPin className="size-4.5" aria-hidden />
                </span>
                <h2 className="mt-4 text-base font-semibold text-foreground">Where we work</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Tripistic is a remote-first company supporting operators across the Americas,
                  Europe, and Asia-Pacific. Our registered postal address and the details of our EU
                  and UK data protection representatives are available on request.
                </p>
                <div
                  role="img"
                  aria-label="Map placeholder showing Tripistic's remote-first coverage across the Americas, Europe, and Asia-Pacific"
                  className="mt-4 flex h-40 items-center justify-center rounded-lg border border-border bg-[linear-gradient(135deg,var(--muted),var(--card))]"
                >
                  <MapPin className="size-6 text-accent" aria-hidden />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  An embedded map loads only after you accept functional cookies, so this page stays
                  fast and privacy-respecting by default.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              ["Security review or procurement", "Request our security pack, DPA, and questionnaires.", "/legal"],
              ["Already a customer?", "Search the help center before you write — most answers are there.", "/help"],
              ["Building an integration?", "Start with the developer reference and OpenAPI document.", "/developers"],
            ].map(([title, description, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-accent/40"
              >
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}
