import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalPlans } from "@/lib/plans/catalog";
import { integrations } from "@/lib/marketing/content";

/**
 * Guards for Phase 1 of the public launch.
 *
 * Copy fixes rot. Someone reinstates a testimonial for a landing-page test,
 * or an "AI" label creeps back into a feature name, and nothing objects. These
 * assertions are the durable half of the work: they fail when a claim the
 * product cannot support reappears.
 */

const ROOT = process.cwd();

function readIfExists(path: string): string {
  const full = join(ROOT, path);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

/** Marketing surfaces a visitor actually reads. */
const MARKETING_SOURCES = [
  "app/page.tsx",
  "app/ai-platform/page.tsx",
  "app/integrations/page.tsx",
  "app/demo/page.tsx",
  "app/pricing/page.tsx",
  "lib/marketing/content.ts",
  "lib/marketing/pricing.ts",
  "components/marketing/marketing-sections.tsx",
  "components/marketing/marketing-shell.tsx",
].map((p) => ({ path: p, text: readIfExists(p) }));

describe("no fabricated endorsements", () => {
  // Tripistic is pre-launch and has no customers. Any named quote is invented,
  // and presenting one as a testimonial is unlawful under FTC endorsement
  // guidance, not merely inaccurate.
  const REMOVED_PERSONAS = ["City experiences operator", "Private travel agency founder", "DMC operations lead"];

  it.each(REMOVED_PERSONAS)("does not reintroduce the %s testimonial", (persona) => {
    for (const { path, text } of MARKETING_SOURCES) {
      expect(text, `${path} reintroduced a fabricated testimonial`).not.toContain(persona);
    }
  });

  it("has no testimonials array on the homepage", () => {
    const home = readIfExists("app/page.tsx");
    expect(home).not.toMatch(/const\s+testimonials\s*=/);
  });
});

describe("no unbacked AI capability claims", () => {
  // There is no LLM integration anywhere: a repo-wide search for
  // api.openai.com, openrouter.ai and chat/completions returns nothing.
  // Business Brain is a deterministic rule engine and says so in its header.
  // Exact product-name claims that must never return.
  const FORBIDDEN = ["AI Copilot", "AI Reports", "AI OS", "AI Travel Operating System"];

  // Phrases implying generative/LLM capability. Narrow enough to avoid false
  // positives on legitimate prose, broad enough to catch the wording that was
  // actually there before Phase 1.
  const FORBIDDEN_PATTERNS = [
    /\bAI[- ]native\b/i,
    /\bAI[- ]generated\b/i,
    /\bAI[- ]assisted\b/i,
    /\bAI itinerar/i,
    /\bAI provider/i,
    /\bAI search\b/i,
  ];

  it.each(FORBIDDEN)("does not claim %s", (claim) => {
    for (const { path, text } of MARKETING_SOURCES) {
      // Allow the explanatory comment that records why the claim was removed.
      const withoutComments = text.replace(/^\s*\/\/.*$/gm, "");
      expect(withoutComments, `${path} claims "${claim}"`).not.toContain(claim);
    }
  });

  it.each(FORBIDDEN_PATTERNS)("does not imply generative capability via %s", (pattern) => {
    for (const { path, text } of MARKETING_SOURCES) {
      const withoutComments = text.replace(/^\s*\/\/.*$/gm, "");
      expect(withoutComments, `${path} matches ${pattern}`).not.toMatch(pattern);
    }
  });
});

describe("integration status is declared, not implied", () => {
  it("marks only Stripe and Cloudflare as available", () => {
    const available = integrations.filter((i) => i.status === "available").map((i) => i.name).sort();
    expect(available).toEqual(["Cloudflare", "Stripe"]);
  });

  it("gives every integration an explicit status", () => {
    for (const integration of integrations) {
      expect(["available", "beta", "planned"]).toContain(integration.status);
      expect(integration.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("the plan catalog does not advertise unimplemented features", () => {
  it("makes no SSO/SAML claim while auth is credentials-only", () => {
    for (const plan of canonicalPlans) {
      const claims = [...plan.features, ...(plan.highlights ?? [])].join(" ");
      expect(claims, `${plan.slug} advertises SSO/SAML`).not.toMatch(/SSO|SAML/i);
      expect(plan.flags.sso_saml, `${plan.slug} enables sso_saml`).toBe(false);
    }
  });

  it("keeps Solo at exactly $29/month and $278/year", () => {
    // The commercial anchor. Guarded so a copy edit cannot drift it.
    const solo = canonicalPlans.find((p) => p.slug === "solo");
    expect(solo?.monthlyPriceCents).toBe(2900);
    expect(solo?.yearlyPriceCents).toBe(27800);
  });
});

describe("the API is not advertised as available", () => {
  it("declares no unsatisfiable top-level security in the OpenAPI spec", () => {
    const spec = JSON.parse(readIfExists("public/openapi.json")) as Record<string, unknown>;
    // No bearer-auth path exists in the app; requiring a token would tell a
    // client that one works.
    expect(spec.security).toBeUndefined();
    expect((spec.info as Record<string, unknown>)["x-status"]).toBe("planned");
  });

  it("marks every developer API doc as planned", () => {
    const dir = join(ROOT, "content/developers");
    const docs = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      const text = readFileSync(join(dir, doc), "utf8");
      expect(text, `${doc} is not marked planned`).toContain("Status: planned");
    }
  });
});

describe("the SLA does not promise what cannot be measured", () => {
  it("is marked not in force while no monitoring exists", () => {
    const sla = readIfExists("content/legal/service-level-agreement.md");
    expect(sla).toContain("Status: not in force");
  });
});

describe("no stale phase copy remains", () => {
  // These told paying users the product was less finished than it is.
  const APP_SURFACES = [
    "components/app/app-shell.tsx",
    "components/dashboard/upgrade-prompt.tsx",
    "app/admin/page.tsx",
    "app/admin/plans/page.tsx",
    "components/tours/tour-form.tsx",
    "app/dashboard/billing/page.tsx",
  ];

  it.each(APP_SURFACES)("%s carries no 'arrives in Phase N' copy", (path) => {
    const text = readIfExists(path);
    expect(text).not.toMatch(/arrives? (?:in|with) (?:billing in )?Phase \d/i);
    expect(text).not.toMatch(/arrive in later phases/i);
  });
});
