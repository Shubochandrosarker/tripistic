import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalPlans, type PlanFeatureKey } from "@/lib/plans/catalog";

/**
 * Phase 8 — the guard that keeps entitlement enforcement from rotting.
 *
 * The gap being closed was that the plan catalog defined 22 feature flags and
 * nothing on the server checked any of them: the flags drove pricing copy and
 * which nav links rendered. A Solo customer who typed the URL had working
 * access to every paid tier's differentiator.
 *
 * Sweeping the existing routes fixed that once. This test is what stops it
 * happening again — a new route added under `vehicles/` or `leads/` that
 * forgets the gate fails here rather than shipping as a quiet entitlement
 * hole nobody notices until a customer does.
 */

const API_ROOT = join(process.cwd(), "app", "api", "workspaces", "[id]");

/**
 * Route directory -> the feature that gates it.
 *
 * Deliberately keyed on the top-level path segment rather than on a list of
 * files, so adding `vehicles/[vehicleId]/inspections/route.ts` is covered
 * automatically instead of needing this map updated too.
 */
const GATED_AREAS: Record<string, PlanFeatureKey> = {
  leads: "crm_pipeline",
  companies: "crm_pipeline",
  "crm-tasks": "crm_pipeline",
  "crm-activities": "crm_pipeline",
  itineraries: "itinerary_builder",
  operations: "operations_dispatch",
  incidents: "operations_dispatch",
  vehicles: "vehicles",
  vendors: "suppliers",
  guides: "guide_scheduling",
  domains: "custom_domain",
  storefront: "white_label",
  "business-brain": "advanced_ai",
  "waiver-template": "digital_waivers",
};

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/**
 * Gated routes that do not live under `app/api/workspaces/[id]`.
 *
 * `app/api/audit-logs/route.ts` takes its workspace from a query parameter
 * rather than the path, so it sits outside the tree above — and was therefore
 * missed by the first enforcement sweep AND by the first version of this test.
 * Listing it explicitly is the fix for both. Any future workspace-scoped route
 * placed outside that tree belongs here too.
 */
const OUTLIERS: Record<string, PlanFeatureKey> = {
  "app/api/audit-logs/route.ts": "audit_logs",
};

const routeFiles = [
  ...findRouteFiles(API_ROOT).map((file) => ({
    path: file,
    rel: relative(API_ROOT, file).split(sep).join("/"),
    source: readFileSync(file, "utf8"),
    feature: undefined as PlanFeatureKey | undefined,
  })),
  ...Object.entries(OUTLIERS).map(([rel, feature]) => ({
    path: join(process.cwd(), rel),
    rel,
    source: readFileSync(join(process.cwd(), rel), "utf8"),
    feature,
  })),
];

/** Exported HTTP handlers, i.e. how many entry points a file actually has. */
function handlerCount(source: string): number {
  return (source.match(/export\s+(?:async\s+function|const)\s+(GET|POST|PATCH|PUT|DELETE)\b/g) ?? [])
    .length;
}

function accessCalls(source: string): string[] {
  return source.match(/requireWorkspaceAccess\([^)]*\)/g) ?? [];
}

describe("every route in a gated area enforces its feature", () => {
  const gatedRoutes = routeFiles.filter((f) => f.feature ?? GATED_AREAS[f.rel.split("/")[0]]);

  it("finds the routes at all — a broken glob must not pass silently", () => {
    // Without this, a path change would make every assertion below vacuous.
    expect(routeFiles.length).toBeGreaterThan(40);
    expect(gatedRoutes.length).toBeGreaterThan(30);
  });

  it.each(gatedRoutes.map((f) => [f.rel, f] as const))("%s", (_rel, file) => {
    const feature = file.feature ?? GATED_AREAS[file.rel.split("/")[0]];
    const calls = accessCalls(file.source);

    // A route in a gated area that never checks tenancy is a bigger problem
    // than a missing feature gate, and this is the test that would notice.
    expect(calls.length, "route does not call requireWorkspaceAccess").toBeGreaterThan(0);

    for (const call of calls) {
      expect(call, `missing feature gate (expected "${feature}")`).toContain(`feature: "${feature}"`);
    }
  });

  it("gates every handler, not just the first one in each file", () => {
    // A file with GET+POST+DELETE that gates only GET would leave the writes
    // open — the exact shape of hole this sweep exists to close.
    const holes = gatedRoutes
      .map((file) => ({
        rel: file.rel,
        handlers: handlerCount(file.source),
        gated: accessCalls(file.source).filter((c) => c.includes("feature:")).length,
      }))
      .filter((row) => row.gated < row.handlers);

    expect(holes).toEqual([]);
  });
});

describe("the gate map stays consistent with the catalog", () => {
  it("names only features the catalog actually defines", () => {
    const known = new Set(Object.keys(canonicalPlans[0].flags));
    for (const feature of [...Object.values(GATED_AREAS), ...Object.values(OUTLIERS)]) {
      expect(known, `unknown feature key "${feature}"`).toContain(feature);
    }
  });

  it("gates at least one area for every feature that a paid tier adds", () => {
    // If Operator/Agency add a flag over Solo, customers are paying for it —
    // so something on the server has to be refusing it to Solo.
    const solo = canonicalPlans.find((p) => p.slug === "solo")!;
    const agency = canonicalPlans.find((p) => p.slug === "agency")!;
    const gated = new Set([...Object.values(GATED_AREAS), ...Object.values(OUTLIERS)]);

    const upsell = (Object.keys(agency.flags) as PlanFeatureKey[]).filter(
      (key) => agency.flags[key] && !solo.flags[key],
    );

    // `api_access` is the documented exception: no public API exists yet, so
    // there is no route to gate. If one is built, it must be gated and this
    // list must shrink.
    const ungated = upsell.filter((key) => !gated.has(key) && key !== "api_access");
    expect(ungated).toEqual([]);
  });

  it("keeps api_access honest — the exemption ends when the API ships", () => {
    // Guards the exemption above: the moment a public API route exists, this
    // fails and forces the gate rather than letting the exception persist.
    const publicApiRoutes = routeFiles.filter((f) => f.rel.startsWith("api-keys"));
    expect(publicApiRoutes).toEqual([]);
  });
});
