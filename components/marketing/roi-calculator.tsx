"use client";

import { useMemo, useState } from "react";
import { Calculator, TrendingUp } from "lucide-react";

import { Counter } from "@/components/marketing/motion";
import { ButtonLink } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/events";

type Field = {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
};

const FIELDS: Field[] = [
  {
    id: "bookings",
    label: "Bookings per month",
    hint: "Across every channel",
    min: 10,
    max: 1000,
    step: 10,
    format: (value) => value.toLocaleString("en-US"),
  },
  {
    id: "averageValue",
    label: "Average booking value",
    hint: "Total paid per booking",
    min: 25,
    max: 5000,
    step: 25,
    format: (value) => `$${value.toLocaleString("en-US")}`,
  },
  {
    id: "marketplaceShare",
    label: "Share booked via marketplaces",
    hint: "Where you pay commission",
    min: 0,
    max: 100,
    step: 5,
    format: (value) => `${value}%`,
  },
  {
    id: "commission",
    label: "Marketplace commission",
    hint: "Typical range is 20–30%",
    min: 0,
    max: 35,
    step: 1,
    format: (value) => `${value}%`,
  },
  {
    id: "adminHours",
    label: "Admin hours per week",
    hint: "Confirmations, chasing payments, scheduling",
    min: 0,
    max: 60,
    step: 1,
    format: (value) => `${value} h`,
  },
  {
    id: "hourlyCost",
    label: "Loaded hourly cost",
    hint: "What an admin hour actually costs you",
    min: 10,
    max: 150,
    step: 5,
    format: (value) => `$${value}`,
  },
];

const DEFAULTS: Record<string, number> = {
  bookings: 200,
  averageValue: 120,
  marketplaceShare: 60,
  commission: 25,
  adminHours: 15,
  hourlyCost: 30,
};

/** Conservative assumptions, stated openly below the result. */
const DIRECT_SHIFT = 0.2; // Share of marketplace volume moved to direct in year one.
const ADMIN_REDUCTION = 0.4; // Share of admin hours removed by automation.
const PLAN_COST_MONTHLY = 149;

export function RoiCalculator() {
  const [values, setValues] = useState<Record<string, number>>(DEFAULTS);

  const result = useMemo(() => {
    const monthlyRevenue = values.bookings * values.averageValue;
    const marketplaceRevenue = monthlyRevenue * (values.marketplaceShare / 100);

    const commissionSaved = marketplaceRevenue * DIRECT_SHIFT * (values.commission / 100);
    const adminSaved = values.adminHours * ADMIN_REDUCTION * values.hourlyCost * 4.33;

    const monthlyGain = commissionSaved + adminSaved;
    const annualGain = monthlyGain * 12;
    const annualCost = PLAN_COST_MONTHLY * 12;
    const netAnnual = annualGain - annualCost;
    const paybackWeeks = monthlyGain > 0 ? (PLAN_COST_MONTHLY / monthlyGain) * 4.33 : 0;

    return {
      commissionSaved: Math.round(commissionSaved),
      adminSaved: Math.round(adminSaved),
      monthlyGain: Math.round(monthlyGain),
      annualGain: Math.round(annualGain),
      netAnnual: Math.round(netAnnual),
      hoursSaved: Math.round(values.adminHours * ADMIN_REDUCTION * 4.33),
      paybackWeeks: Math.max(0.1, Number(paybackWeeks.toFixed(1))),
    };
  }, [values]);

  return (
    <section aria-labelledby="roi-heading" className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Calculator className="size-5" aria-hidden />
        </span>
        <div>
          <h2 id="roi-heading" className="text-2xl font-semibold tracking-tight text-foreground">
            ROI calculator
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Adjust the inputs to your business. The result combines commission recovered by shifting
            bookings to direct with admin time removed by automation.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
        <div className="grid gap-5 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.id}>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`roi-${field.id}`} className="text-sm font-medium text-foreground">
                  {field.label}
                </label>
                <output
                  htmlFor={`roi-${field.id}`}
                  className="text-sm font-semibold tabular-nums text-accent"
                >
                  {field.format(values[field.id])}
                </output>
              </div>
              <input
                id={`roi-${field.id}`}
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={values[field.id]}
                aria-describedby={`roi-${field.id}-hint`}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.id]: Number(event.target.value) }))
                }
                onPointerUp={() => trackEvent("roi_calculated", { field: field.id })}
                className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              <p id={`roi-${field.id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
                {field.hint}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-background p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estimated first-year impact
          </p>

          <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
            <Counter value={result.netAnnual} prefix="$" />
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            net annual gain after the Operator plan
          </p>

          <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Commission recovered / month</dt>
              <dd className="font-medium tabular-nums text-foreground">
                ${result.commissionSaved.toLocaleString("en-US")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Admin cost removed / month</dt>
              <dd className="font-medium tabular-nums text-foreground">
                ${result.adminSaved.toLocaleString("en-US")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Hours returned / month</dt>
              <dd className="font-medium tabular-nums text-foreground">{result.hoursSaved} h</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <dt className="text-muted-foreground">Payback period</dt>
              <dd className="font-medium tabular-nums text-accent">
                {result.paybackWeeks} weeks
              </dd>
            </div>
          </dl>

          <ButtonLink href="/register" className="mt-6 w-full">
            <TrendingUp className="size-4" aria-hidden /> Start free
          </ButtonLink>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Assumes {Math.round(DIRECT_SHIFT * 100)}% of marketplace volume shifts to direct in year
            one and {Math.round(ADMIN_REDUCTION * 100)}% of admin time is automated, against the
            ${PLAN_COST_MONTHLY}/mo Operator plan. An estimate, not a guarantee — your results depend
            on your channel mix and how consistently you run the workflows.
          </p>
        </div>
      </div>
    </section>
  );
}
