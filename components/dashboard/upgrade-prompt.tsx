import { ArrowUpRight, Zap } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/**
 * Upgrade prompt placeholder. Self-serve plan changes ship with Stripe
 * billing in Phase 10 — until then this routes to the billing page.
 */
export function UpgradePrompt({
  planName,
  message,
}: {
  planName: string;
  message?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Zap className="size-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">
            You&apos;re on the {planName} plan
          </p>
          <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
            {message ??
              "Higher plans unlock more seats, guide scheduling, and the AI Growth Dashboard. Self-serve upgrades arrive with billing in Phase 10 — until then, compare plans below."}
          </p>
        </div>
      </div>
      <ButtonLink href="/dashboard/billing" variant="secondary" size="sm">
        View plans <ArrowUpRight className="size-3.5" aria-hidden />
      </ButtonLink>
    </div>
  );
}
