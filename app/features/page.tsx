import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "Features · Tripistic",
  description: "Explore Tripistic features for bookings, CRM, AI, tours, guides, drivers, vehicles, operations, marketing, reports, white label, custom domains, payments, automation, and analytics.",
};

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Features"
            title="A complete AI-native operating system for travel teams."
            description="Every feature is designed to remove a disconnected tool, reduce manual work, or help operators make better decisions from their own data."
          />
          <div className="mt-12">
            <FeatureGrid />
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
