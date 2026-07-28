"use client";

import { useState } from "react";
import { Check, Minus, Sparkles } from "lucide-react";

import { StaggerGroup, StaggerItem } from "@/components/marketing/motion";
import { ButtonLink } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/events";
import { comparison, plans, YEARLY_SAVINGS_LABEL, type PlanId } from "@/lib/marketing/pricing";
import { cn } from "@/lib/utils";

type Interval = "monthly" | "yearly";

const PLAN_IDS: PlanId[] = ["solo", "operator", "agency", "enterprise"];

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <>
        <Check className="mx-auto size-4 text-accent" aria-hidden />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus className="mx-auto size-4 text-muted-foreground/50" aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="text-foreground">{value}</span>;
}

export function PricingTable() {
  const [interval, setInterval] = useState<Interval>("monthly");

  function selectInterval(next: Interval) {
    setInterval(next);
    trackEvent("pricing_interval_toggle", { interval: next });
  }

  return (
    <>
      <div className="mt-10 flex justify-center">
        <div
          role="radiogroup"
          aria-label="Billing interval"
          className="flex rounded-lg border border-border bg-card p-1"
        >
          {(["monthly", "yearly"] as const).map((option) => {
            const active = interval === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => selectInterval(option)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option === "monthly" ? "Monthly" : `Yearly · ${YEARLY_SAVINGS_LABEL}`}
              </button>
            );
          })}
        </div>
      </div>

      <StaggerGroup className="mt-10 grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const price =
            interval === "monthly"
              ? plan.monthly
              : plan.yearly !== null
                ? Math.round(plan.yearly / 12)
                : null;

          return (
            <StaggerItem key={plan.id} className="h-full">
              <div
                className={cn(
                  "flex h-full flex-col rounded-lg border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                  plan.popular ? "border-accent/50 ring-1 ring-accent/20" : "border-border",
                )}
              >
                {plan.popular ? (
                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                    <Sparkles className="size-3.5" aria-hidden /> Most popular
                  </span>
                ) : (
                  <span className="h-[26px]" aria-hidden />
                )}

                <h3 className="mt-4 text-xl font-semibold text-foreground">{plan.name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.summary}</p>

                <p className="mt-5 flex items-baseline gap-1">
                  {price === null ? (
                    <span className="text-3xl font-semibold text-foreground">Custom</span>
                  ) : (
                    <>
                      <span className="text-3xl font-semibold tabular-nums text-foreground">
                        ${price}
                      </span>
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.yearly !== null && interval === "yearly"
                    ? `$${plan.yearly.toLocaleString("en-US")} billed annually · ${plan.seats}`
                    : plan.monthly !== null
                      ? `Billed monthly · ${plan.seats}`
                      : `${plan.seats} · negotiated terms`}
                </p>

                <ButtonLink
                  href={plan.cta.href}
                  variant={plan.popular ? "primary" : "secondary"}
                  className="mt-5 w-full"
                  onClick={() => trackEvent("pricing_plan_select", { plan: plan.id, interval })}
                >
                  {plan.cta.label}
                </ButtonLink>

                <ul className="mt-5 space-y-3">
                  {plan.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerGroup>

      <section aria-labelledby="comparison-heading" className="mt-16">
        <h2 id="comparison-heading" className="text-2xl font-semibold tracking-tight text-foreground">
          Compare every plan
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          The full capability matrix, including support targets and uptime commitments.
        </p>

        <div className="mt-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[54rem] border-collapse text-sm">
            <caption className="sr-only">Feature comparison across Tripistic plans</caption>
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="p-3 text-left font-semibold text-foreground">
                  Feature
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.id}
                    scope="col"
                    className="p-3 text-center font-semibold text-foreground"
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            {comparison.map((group) => (
              <tbody key={group.group}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={PLAN_IDS.length + 1}
                    className="border-t border-border bg-card p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {group.group}
                  </th>
                </tr>
                {group.rows.map((entry) => (
                  <tr key={entry.feature} className="border-t border-border">
                    <th scope="row" className="p-3 text-left font-normal text-muted-foreground">
                      {entry.feature}
                    </th>
                    {PLAN_IDS.map((planId) => (
                      <td key={planId} className="p-3 text-center">
                        <CellValue value={entry.values[planId]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>
    </>
  );
}
