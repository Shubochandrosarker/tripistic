import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Compass,
  CreditCard,
  MessagesSquare,
  ScrollText,
  Sparkles,
  Users,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

const featureCards = [
  {
    icon: CalendarCheck,
    title: "Online booking",
    description:
      "Accept direct bookings from your website with real-time availability and 0% direct-booking commission.",
  },
  {
    icon: CreditCard,
    title: "Payments & deposits",
    description:
      "Collect full payments, deposits, installments, and payment links through Stripe.",
  },
  {
    icon: MessagesSquare,
    title: "Guest communication",
    description:
      "Send confirmations, reminders, waiver links, updates, and review requests automatically.",
  },
  {
    icon: Users,
    title: "Guide scheduling",
    description:
      "Assign guides, view manifests, and manage daily operations from one dashboard.",
  },
  {
    icon: ScrollText,
    title: "Digital waivers",
    description:
      "Collect signed waivers before arrival and attach them to each booking.",
  },
  {
    icon: Sparkles,
    title: "AI Growth Dashboard",
    description:
      "See what is working, what is underperforming, and what to do next to grow bookings.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Compass className="size-4.5" aria-hidden />
          </span>
          <span className="text-base font-semibold tracking-tight text-foreground">
            Tripistic
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/register" variant="primary" size="sm">
            Start free trial
          </ButtonLink>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4">
        <section className="py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-accent" aria-hidden />
            AI-native tour operations platform
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Run your tour business from one AI-powered dashboard.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Tripistic helps independent tour operators manage bookings, payments, waivers,
            guides, guest communication, and growth insights — with{" "}
            <span className="font-medium text-foreground">0% commission on direct bookings</span>.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/register" size="lg">
              Start free trial <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" size="lg">
              Sign in
            </ButtonLink>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Built for solo guides, small tour teams, local experiences, and growing operators.
          </p>
        </section>

        <section className="pb-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-card p-5 shadow-xs"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <feature.icon className="size-4.5" aria-hidden />
                </span>
                <h2 className="mt-3 text-sm font-semibold text-foreground">{feature.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Phase 1 foundation is live (accounts, workspaces, roles). Booking, payments, and AI
            modules ship in upcoming phases —{" "}
            <Link href="/register" className="font-medium text-accent hover:underline">
              create your workspace now
            </Link>{" "}
            to be ready.
          </p>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Tripistic — AI-native operations for tour businesses.
        </p>
      </footer>
    </div>
  );
}
