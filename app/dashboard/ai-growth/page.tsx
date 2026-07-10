import type { Metadata } from "next";
import { Sparkles, TrendingUp, CalendarRange, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { ButtonLink } from "@/components/ui/button";
import { AIRecommendationCard } from "@/components/dashboard/ai-recommendation-card";

export const metadata: Metadata = {
  title: "AI Growth",
};

const upcoming = [
  {
    icon: TrendingUp,
    title: "Prescriptive growth actions",
    description:
      "Plain-English recommendations with priority and expected impact — accept, dismiss, or mark them done.",
  },
  {
    icon: CalendarRange,
    title: "Demand & occupancy insights",
    description:
      "Which weekdays, time slots, and products over- or under-perform, based on your real booking data.",
  },
  {
    icon: Target,
    title: "Direct-booking growth",
    description:
      "Channel analysis that shows OTA vs direct share and what to change to keep more margin.",
  },
];

export default function AIGrowthPage() {
  return (
    <>
      <PageHeader
        title="AI Growth Dashboard"
        description="Tripistic's flagship: an AI co-pilot that tells you what's happening in your business and what to do next."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AIRecommendationCard />
        <SectionCard title="How it will work" description="Rules first, AI narration second">
          <ul className="space-y-3">
            {upcoming.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <item.icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <EmptyState
        icon={Sparkles}
        phase="Foundation planned for Phase 7"
        title="No AI calls are made yet — and that's deliberate"
        description="The AI Growth Dashboard needs real booking and revenue data to be honest. Once the booking backbone (Phases 2–4) is processing reservations, insights generate from your own numbers — never invented ones."
        actions={
          <ButtonLink href="/dashboard/onboarding" variant="secondary" size="sm">
            Follow the setup path
          </ButtonLink>
        }
      />
    </>
  );
}
