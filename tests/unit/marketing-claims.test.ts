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

/**
 * Marketing surfaces a visitor actually reads.
 *
 * Phase 10 widened this list, and the reason is worth recording: the original
 * nine files were the pages someone browses, which meant the guard never saw
 * the *highest-reach* claims in the product. `app/layout.tsx` sets the default
 * `<title>` on every page. `lib/seo/site.ts` supplies the meta description
 * behind every search result and social card. `app/llms.txt` is what AI
 * crawlers read. All three still said "AI-native" and "AI itineraries" months
 * after Phase 1 "removed" those claims, because nothing checked them.
 *
 * The lesson generalises: a copy guard has to cover the surfaces with the
 * widest reach, not the ones that are easiest to think of.
 */
const MARKETING_SOURCES = [
  "app/page.tsx",
  "app/ai-platform/page.tsx",
  "app/integrations/page.tsx",
  "app/demo/page.tsx",
  "app/pricing/page.tsx",
  "app/features/page.tsx",
  "lib/marketing/content.ts",
  "lib/marketing/pricing.ts",
  "components/marketing/marketing-sections.tsx",
  "components/marketing/marketing-shell.tsx",
  // Added in Phase 10 — every one of these carried a live AI claim.
  "app/layout.tsx",
  "lib/seo/site.ts",
  "app/llms.txt/route.ts",
  "app/roadmap/page.tsx",
  // Carried three invented case studies with quantified results.
  "app/customers/page.tsx",
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

  it("quotes no measured customer outcome anywhere, because none has been measured", () => {
    // /customers presented three invented case studies with specific figures —
    // "18% more direct booking share", "3x faster proposal turnaround",
    // "40 hours saved monthly" — for a product with no customers. Numbers make
    // a fabricated claim worse, not better: they read as measurement.
    const RESULT_CLAIM = [
      /\b\d+%\s+(more|higher|faster|fewer|less|increase)/i,
      /\b\d+x\s+(faster|more|higher)/i,
      /\b\d+\s+hours?\s+saved/i,
    ];
    for (const { path, text } of MARKETING_SOURCES) {
      const withoutComments = text.replace(/^\s*\/\/.*$/gm, "");
      for (const pattern of RESULT_CLAIM) {
        expect(withoutComments, `${path} quotes an unmeasured result (${pattern})`).not.toMatch(
          pattern,
        );
      }
    }
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
    // A space is required rather than `[- ]`, so the legitimate `/ai-platform`
    // route in an href is not mistaken for a capability claim.
    /\bAI copilot\b/i,
    /\bAI platform\b/i,
  ];

  it.each(FORBIDDEN)("does not claim %s", (claim) => {
    for (const { path, text } of MARKETING_SOURCES) {
      // Allow the explanatory comment that records why the claim was removed.
      const withoutComments = text.replace(/^\s*\/\/.*$/gm, "");
      // Case-insensitive, and that is not pedantry: the original check used
      // `toContain`, so "AI copilot" in lowercase sat in app/llms.txt for
      // months while the guard passed on "AI Copilot".
      expect(withoutComments.toLowerCase(), `${path} claims "${claim}"`).not.toContain(
        claim.toLowerCase(),
      );
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

  it("makes no AI capability claim while no model is ever called", () => {
    // This is the claim that mattered most and was guarded least: Solo
    // advertised "Basic AI copilot" in its feature list, so a capability that
    // does not exist was being sold at $29/month on the pricing page. Nothing
    // checked the catalog for AI wording — only for SSO — so it survived
    // Phase 1's cleanup untouched.
    for (const plan of canonicalPlans) {
      const claims = [...plan.features, ...(plan.highlights ?? []), plan.summary, plan.description].join(" ");
      expect(claims, `${plan.slug} advertises an AI capability`).not.toMatch(/\bAI\b/i);
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
