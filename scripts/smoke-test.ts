/**
 * Production smoke test.
 *
 * Verifies a *deployed* Tripistic against the things that are only true once
 * it is actually running: TLS, headers, health, auth boundaries, the public
 * booking surface, and the configuration that unit tests cannot see because
 * unit tests supply their own environment.
 *
 *   SMOKE_BASE_URL=https://tripistic.com npm run smoke
 *
 * Design notes, because they shape what this can and cannot tell you:
 *
 *  - **HTTP only, no browser.** It runs from a laptop, from CI, or from the
 *    VPS itself over localhost. The browser journey is covered separately by
 *    the Playwright suite; duplicating it here would make this too heavy to
 *    run after every deploy, which is when it earns its keep.
 *  - **Read-only by default.** Nothing here creates a booking, charges a card,
 *    or sends an email unless you opt in. A smoke test that pollutes
 *    production is one people stop running.
 *  - **Severity is explicit.** `critical` means do not serve customers.
 *    `warning` means a capability is unavailable but the product works.
 *    Exit code is non-zero only for critical failures, so this is safe to gate
 *    a deploy on.
 *  - **Absence of proof is reported as such.** Checks that could not run (no
 *    CRON_SECRET, no storefront slug) are `skipped`, never silently passed.
 *    A green run that skipped half its checks is not a green run, and the
 *    summary says so.
 */

type Severity = "critical" | "warning";
type Status = "pass" | "fail" | "skip";

type Result = {
  group: string;
  name: string;
  status: Status;
  severity: Severity;
  detail: string;
};

const results: Result[] = [];

const BASE = (process.env.SMOKE_BASE_URL ?? "").replace(/\/+$/, "");
const STOREFRONT_SLUG = process.env.SMOKE_STOREFRONT_SLUG ?? "";
const CUSTOM_DOMAIN = process.env.SMOKE_CUSTOM_DOMAIN ?? "";
const CRON_SECRET = process.env.SMOKE_CRON_SECRET ?? "";
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 15_000);

function record(
  group: string,
  name: string,
  status: Status,
  severity: Severity,
  detail: string,
) {
  results.push({ group, name, status, severity, detail });
  const mark = status === "pass" ? "PASS" : status === "skip" ? "SKIP" : "FAIL";
  const tag = status === "fail" ? ` (${severity})` : "";
  console.log(`  [${mark}]${tag} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "manual" });
  } finally {
    clearTimeout(timer);
  }
}

/** Wraps a check so one thrown error cannot end the run. */
async function check(
  group: string,
  name: string,
  severity: Severity,
  fn: () => Promise<{ ok: boolean; detail: string } | { skip: string }>,
) {
  try {
    const outcome = await fn();
    if ("skip" in outcome) return record(group, name, "skip", severity, outcome.skip);
    record(group, name, outcome.ok ? "pass" : "fail", severity, outcome.detail);
  } catch (error) {
    record(group, name, "fail", severity, error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

async function availability() {
  console.log("\nAvailability");

  await check("availability", "liveness responds", "critical", async () => {
    const started = Date.now();
    const res = await fetchWithTimeout(`${BASE}/api/health/live`);
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    return {
      ok: res.status === 200 && body?.status === "ok",
      detail: `${res.status} in ${Date.now() - started}ms`,
    };
  });

  await check("availability", "readiness reports the database reachable", "critical", async () => {
    const res = await fetchWithTimeout(`${BASE}/api/health/ready`);
    const body = (await res.json().catch(() => null)) as
      | { status?: string; checks?: { database?: string } }
      | null;
    return {
      ok: res.status === 200 && body?.checks?.database === "ok",
      detail: res.status === 200 ? "database ok" : `HTTP ${res.status} — app cannot serve traffic`,
    };
  });

  await check("availability", "readiness leaks no deployment detail", "critical", async () => {
    // Unauthenticated and reachable from anywhere, so it must not disclose
    // connection strings, hostnames, driver messages or versions.
    const text = await (await fetchWithTimeout(`${BASE}/api/health/ready`)).text();
    const leaks = ["postgres", "password", "prisma", "localhost", "@"].filter((needle) =>
      text.toLowerCase().includes(needle),
    );
    return { ok: leaks.length === 0, detail: leaks.length ? `leaked: ${leaks.join(", ")}` : "clean" };
  });

  await check("availability", "marketing home renders", "critical", async () => {
    const res = await fetchWithTimeout(`${BASE}/`);
    return { ok: res.status === 200, detail: `HTTP ${res.status}` };
  });
}

// ---------------------------------------------------------------------------
// Transport security
// ---------------------------------------------------------------------------

async function transport() {
  console.log("\nTransport security");
  const isHttps = BASE.startsWith("https://");

  await check("transport", "served over HTTPS", "critical", async () => {
    if (!isHttps) {
      return {
        ok: false,
        detail: "SMOKE_BASE_URL is http:// — session and payment cookies require TLS in production",
      };
    }
    return { ok: true, detail: "https" };
  });

  await check("transport", "HSTS is set", "warning", async () => {
    if (!isHttps) return { skip: "not applicable over http" };
    const res = await fetchWithTimeout(`${BASE}/`);
    const hsts = res.headers.get("strict-transport-security");
    return { ok: Boolean(hsts), detail: hsts ?? "missing Strict-Transport-Security" };
  });

  await check("transport", "http redirects to https", "warning", async () => {
    if (!isHttps) return { skip: "not applicable over http" };
    const res = await fetchWithTimeout(BASE.replace("https://", "http://"));
    const location = res.headers.get("location") ?? "";
    return {
      ok: res.status >= 300 && res.status < 400 && location.startsWith("https://"),
      detail: `HTTP ${res.status} -> ${location || "(no redirect)"}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Response headers
// ---------------------------------------------------------------------------

async function headers() {
  console.log("\nResponse headers");

  await check("headers", "content type options set", "warning", async () => {
    const res = await fetchWithTimeout(`${BASE}/`);
    const value = res.headers.get("x-content-type-options");
    return { ok: value === "nosniff", detail: value ?? "missing" };
  });

  await check("headers", "referrer policy set", "warning", async () => {
    const res = await fetchWithTimeout(`${BASE}/`);
    const value = res.headers.get("referrer-policy");
    return { ok: Boolean(value), detail: value ?? "missing" };
  });

  await check("headers", "correlation id returned", "warning", async () => {
    // Phase 6 stamps this on every response. Without it, "find the logs for
    // the request that failed" has no starting point.
    const res = await fetchWithTimeout(`${BASE}/`);
    const value = res.headers.get("x-request-id");
    return { ok: Boolean(value), detail: value ? "present" : "missing x-request-id" };
  });

  await check("headers", "embed routes remain iframe-embeddable", "critical", async () => {
    // Deliberately the inverse of the usual check. /embed/** exists to be put
    // in an iframe on an operator's own website; a blanket DENY here would
    // silently break every embedded booking widget in production, and it is
    // exactly the sort of thing a well-meaning security sweep adds.
    if (!STOREFRONT_SLUG) return { skip: "set SMOKE_STOREFRONT_SLUG to check" };
    const res = await fetchWithTimeout(`${BASE}/embed/${STOREFRONT_SLUG}/any-tour`);
    const xfo = res.headers.get("x-frame-options");
    const csp = res.headers.get("content-security-policy") ?? "";
    const blocked =
      (xfo && /deny|sameorigin/i.test(xfo)) || /frame-ancestors\s+'none'/i.test(csp);
    return {
      ok: !blocked,
      detail: blocked ? `embedding blocked by ${xfo ? "X-Frame-Options" : "CSP"}` : "embeddable",
    };
  });
}

// ---------------------------------------------------------------------------
// Authentication and authorisation boundaries
// ---------------------------------------------------------------------------

async function boundaries() {
  console.log("\nAuth boundaries");

  await check("boundaries", "dashboard requires a session", "critical", async () => {
    const res = await fetchWithTimeout(`${BASE}/dashboard`);
    const location = res.headers.get("location") ?? "";
    const redirectedToLogin = res.status >= 300 && res.status < 400 && /login/.test(location);
    return {
      ok: redirectedToLogin,
      detail: redirectedToLogin ? "redirects to login" : `HTTP ${res.status} ${location}`,
    };
  });

  await check("boundaries", "admin surface is not advertised", "critical", async () => {
    const res = await fetchWithTimeout(`${BASE}/admin`);
    const location = res.headers.get("location") ?? "";
    const ok = res.status === 404 || (res.status >= 300 && res.status < 400 && /login/.test(location));
    return { ok, detail: `HTTP ${res.status} ${location}` };
  });

  await check("boundaries", "workspace API rejects anonymous callers", "critical", async () => {
    const res = await fetchWithTimeout(`${BASE}/api/workspaces/any-workspace-id/bookings`);
    // 401 unauthenticated, or 404 because tenancy refuses to confirm existence.
    return { ok: res.status === 401 || res.status === 404, detail: `HTTP ${res.status}` };
  });

  await check("boundaries", "scheduled-job endpoint fails closed", "critical", async () => {
    // With CRON_SECRET unset the route 404s for everyone. With it set, a wrong
    // secret must also 404 — never 401, which would confirm the endpoint.
    const res = await fetchWithTimeout(`${BASE}/api/jobs/run`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tripistic-cron-secret": "definitely-wrong" },
      body: JSON.stringify({ job: "payments.expire-pending" }),
    });
    return { ok: res.status === 404, detail: `HTTP ${res.status} for a wrong secret` };
  });

  await check("boundaries", "Stripe webhook rejects unsigned payloads", "critical", async () => {
    // A 400 proves the signing secret is configured and enforced. A 200 would
    // mean anyone can forge a payment confirmation; a 500 means it is
    // misconfigured and real webhooks are failing too.
    const res = await fetchWithTimeout(`${BASE}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "evt_smoke", type: "checkout.session.completed" }),
    });
    return {
      ok: res.status === 400,
      detail:
        res.status === 400
          ? "rejected unsigned"
          : `HTTP ${res.status} — expected 400; 200 means forgeable, 500 means misconfigured`,
    };
  });
}

// ---------------------------------------------------------------------------
// Account-security behaviour
// ---------------------------------------------------------------------------

async function accountSecurity() {
  console.log("\nAccount security");

  await check("account", "password reset does not reveal whether an account exists", "critical", async () => {
    // Two addresses that cannot both exist. Identical responses, or this
    // endpoint is an account-enumeration oracle.
    const post = (email: string) =>
      fetchWithTimeout(`${BASE}/api/auth/password-reset/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

    const a = await post(`smoke-${Date.now()}-a@example.invalid`);
    const b = await post(`smoke-${Date.now()}-b@example.invalid`);
    const [aBody, bBody] = [await a.text(), await b.text()];

    return {
      ok: a.status === b.status && aBody === bBody && a.status === 202,
      detail:
        a.status === b.status && aBody === bBody
          ? `both ${a.status}, identical body`
          : `differs: ${a.status} vs ${b.status}`,
    };
  });

  await check("account", "registration validates input", "warning", async () => {
    const res = await fetchWithTimeout(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x", email: "not-an-email", password: "short" }),
    });
    // 400 rejected, or 429 because a previous smoke run used the budget —
    // both prove the endpoint is guarded rather than accepting anything.
    return { ok: res.status === 400 || res.status === 429, detail: `HTTP ${res.status}` };
  });
}

// ---------------------------------------------------------------------------
// Public product surface
// ---------------------------------------------------------------------------

async function publicSurface() {
  console.log("\nPublic surface");

  for (const path of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/pricing"]) {
    await check("public", `${path} serves`, "warning", async () => {
      const res = await fetchWithTimeout(`${BASE}${path}`);
      return { ok: res.status === 200, detail: `HTTP ${res.status}` };
    });
  }

  await check("public", "storefront renders", "critical", async () => {
    if (!STOREFRONT_SLUG) return { skip: "set SMOKE_STOREFRONT_SLUG to check" };
    const res = await fetchWithTimeout(`${BASE}/book/${STOREFRONT_SLUG}`);
    return { ok: res.status === 200, detail: `HTTP ${res.status}` };
  });

  await check("public", "unknown storefront 404s", "warning", async () => {
    const res = await fetchWithTimeout(`${BASE}/book/definitely-not-a-real-workspace-slug`);
    return { ok: res.status === 404, detail: `HTTP ${res.status}` };
  });

  await check("public", "custom domain serves the operator's storefront", "critical", async () => {
    if (!CUSTOM_DOMAIN) return { skip: "set SMOKE_CUSTOM_DOMAIN to check" };
    const res = await fetchWithTimeout(`https://${CUSTOM_DOMAIN}/`);
    return {
      ok: res.status === 200,
      detail:
        res.status === 200
          ? "resolves and serves"
          : `HTTP ${res.status} — DNS, TLS or host mapping is wrong`,
    };
  });

  await check("public", "custom domain is white-labelled", "warning", async () => {
    if (!CUSTOM_DOMAIN) return { skip: "set SMOKE_CUSTOM_DOMAIN to check" };
    const html = await (await fetchWithTimeout(`https://${CUSTOM_DOMAIN}/`)).text();
    // On a plan including white_label the vendor is not named. If the plan
    // does not include it, this is expected to appear — hence a warning.
    const branded = !/Powered by Tripistic/i.test(html);
    return {
      ok: branded,
      detail: branded ? "no vendor attribution" : "'Powered by Tripistic' present (expected if the plan excludes white-label)",
    };
  });
}

// ---------------------------------------------------------------------------
// Public claims
// ---------------------------------------------------------------------------

async function claims() {
  console.log("\nPublic claims");

  await check("claims", "served pages make no unbacked AI claim", "critical", async () => {
    // The Phase 10 guard runs against source. This runs against what is
    // actually served, which is what a customer and a regulator would read —
    // and catches a stale build or a CDN serving old HTML.
    const paths = ["/", "/pricing", "/features", "/customers", "/llms.txt"];
    const offenders: string[] = [];
    const patterns = [/\bAI[- ]native\b/i, /\bAI copilot\b/i, /\bAI itinerar/i];

    for (const path of paths) {
      const res = await fetchWithTimeout(`${BASE}${path}`);
      if (res.status !== 200) continue;
      const html = await res.text();
      for (const pattern of patterns) {
        if (pattern.test(html)) offenders.push(`${path} ~ ${pattern}`);
      }
    }
    return { ok: offenders.length === 0, detail: offenders.join("; ") || "clean" };
  });

  await check("claims", "served pages quote no unmeasured result", "critical", async () => {
    const offenders: string[] = [];
    const patterns = [/\b\d+%\s+(more|higher|faster)/i, /\b\d+x\s+(faster|more)/i, /\b\d+\s+hours?\s+saved/i];
    for (const path of ["/", "/customers", "/pricing"]) {
      const res = await fetchWithTimeout(`${BASE}${path}`);
      if (res.status !== 200) continue;
      const html = await res.text();
      for (const pattern of patterns) {
        if (pattern.test(html)) offenders.push(`${path} ~ ${pattern}`);
      }
    }
    return { ok: offenders.length === 0, detail: offenders.join("; ") || "clean" };
  });
}

// ---------------------------------------------------------------------------
// Scheduled jobs (opt-in — needs the deployment's CRON_SECRET)
// ---------------------------------------------------------------------------

async function scheduler() {
  console.log("\nScheduled jobs");

  await check("scheduler", "job runner executes", "warning", async () => {
    if (!CRON_SECRET) {
      return {
        skip: "set SMOKE_CRON_SECRET to check — skipped means UNVERIFIED, not healthy",
      };
    }
    const res = await fetchWithTimeout(`${BASE}/api/jobs/run`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tripistic-cron-secret": CRON_SECRET },
      body: JSON.stringify({ job: "payments.expire-pending" }),
    });
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    return {
      ok: res.status === 200 && body?.status === "succeeded",
      detail: res.status === 200 ? `job ${body?.status}` : `HTTP ${res.status}`,
    };
  });
}

// ---------------------------------------------------------------------------

function summarise(): number {
  const failed = results.filter((r) => r.status === "fail");
  const criticalFailures = failed.filter((r) => r.severity === "critical");
  const warnings = failed.filter((r) => r.severity === "warning");
  const skipped = results.filter((r) => r.status === "skip");
  const passed = results.filter((r) => r.status === "pass");

  console.log(`\n${"=".repeat(72)}`);
  console.log(
    `${passed.length} passed · ${criticalFailures.length} critical · ${warnings.length} warning · ${skipped.length} skipped`,
  );

  if (criticalFailures.length) {
    console.log("\nCRITICAL — do not serve customers until these pass:");
    for (const r of criticalFailures) console.log(`  - ${r.name}: ${r.detail}`);
  }
  if (warnings.length) {
    console.log("\nWarnings — a capability is unavailable, the product still works:");
    for (const r of warnings) console.log(`  - ${r.name}: ${r.detail}`);
  }
  if (skipped.length) {
    // Stated loudly on purpose. A run that skipped half its checks is not a
    // verified deployment, and the easiest way to fool yourself with a smoke
    // test is to read "no failures" as "everything works".
    console.log(`\nNOT VERIFIED (${skipped.length}) — these checks did not run:`);
    for (const r of skipped) console.log(`  - ${r.name}: ${r.detail}`);
  }

  if (process.env.SMOKE_JSON_OUT) {
    // Deliberately no timestamp inside the payload the caller diffs; the
    // caller stamps it if they want one.
    console.log(`\nJSON: ${JSON.stringify({ results })}`);
  }

  console.log("=".repeat(72));
  return criticalFailures.length > 0 ? 1 : 0;
}

async function main() {
  if (!BASE) {
    console.error("SMOKE_BASE_URL is required, e.g. SMOKE_BASE_URL=https://tripistic.com npm run smoke");
    process.exitCode = 2;
    return;
  }

  console.log(`Tripistic production smoke test`);
  console.log(`Target: ${BASE}`);

  await availability();
  await transport();
  await headers();
  await boundaries();
  await accountSecurity();
  await publicSurface();
  await claims();
  await scheduler();

  process.exitCode = summarise();
}

main().catch((error) => {
  console.error("smoke test crashed:", error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
