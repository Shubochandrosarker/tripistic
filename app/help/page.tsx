import type { Metadata } from "next";
import { Headphones, LifeBuoy, MessageSquare, PlayCircle, Search } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SearchPanel, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "Help Center · Tripistic",
  description: "Tripistic Help Center with knowledge base, search, articles, videos, troubleshooting, contact support, and community.",
};

export default function HelpPage() {
  const items = [
    [Search, "Knowledge base search", "Find setup, booking, payment, and operations guidance quickly."],
    [PlayCircle, "Videos", "Short walkthroughs for common workflows."],
    [LifeBuoy, "Troubleshooting", "Resolve payment, email, domain, and booking issues."],
    [MessageSquare, "Community", "Share practices with operators and partners."],
    [Headphones, "Contact support", "Reach the Tripistic team for account, billing, and product help."],
  ];
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro eyebrow="Help Center" title="Support for every operator workflow." description="Search articles, watch videos, troubleshoot issues, contact support, and learn from the operator community." />
          <div className="mx-auto mt-10 max-w-3xl">
            <SearchPanel />
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-5">
            {items.map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Icon className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-base font-semibold text-foreground">{title as string}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
