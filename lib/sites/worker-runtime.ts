/**
 * The user Worker source that Tripistic uploads for a published site.
 *
 * This is a template, not a bundler target: `buildWorkerModule` interpolates a
 * JSON payload into a fixed piece of JavaScript. Two consequences worth being
 * explicit about.
 *
 * **Tenants never author any of this.** The only tenant-derived value that
 * reaches the module is `payload`, and it arrives as `JSON.parse` of a string
 * literal, so no tenant content is ever positioned where it could become code.
 * That is the property that makes Workers for Platforms safe to expose to
 * self-serve customers at all.
 *
 * **The Worker holds no secret.** Its bindings are pages, a workspace slug and
 * a public origin. It reads live tour data from Tripistic's *public* tours
 * API — the same endpoint any visitor's browser may call — so a compromised
 * or exfiltrated site Worker discloses nothing that was not already public.
 * Signed service auth (`lib/cloudflare/edge-auth.ts`) exists for the
 * privileged calls a later phase may need; deliberately, none are needed here.
 */

import { esc, tourSlotToken } from "@/lib/sites/render";

export type WorkerPayloadPage = {
  path: string;
  html: string;
  noindex: boolean;
};

export type WorkerPayload = {
  siteId: string;
  workspaceSlug: string;
  /** Tripistic Core origin the Worker reads public tour data from. */
  apiOrigin: string;
  /** Canonical public origin of this site, for sitemap and robots. */
  siteOrigin: string;
  pages: WorkerPayloadPage[];
  /**
   * Per-section tour-grid configuration.
   *
   * Tours are pinned by **slug**, not id: the public tours API returns slugs
   * and never exposes internal ids, and resolving ids to slugs at publish time
   * keeps it that way. A slug that no longer exists simply drops out of the
   * grid rather than rendering a dead card.
   */
  tourSlots: Record<
    string,
    { limit: number; showPrice: boolean; showDuration: boolean; tourSlugs: string[] }
  >;
  /** Emitted at /llms.txt only when the operator opted in. */
  llmsTxt: string | null;
  revisionId: string;
  deploymentId: string;
  /** Preview deployments serve `X-Robots-Tag: noindex` on every response. */
  preview: boolean;
};

/**
 * Tour-card markup, duplicated here on purpose.
 *
 * `lib/sites/render.ts` renders every other section at publish time. Tour
 * cards cannot be: a price rendered at publish would be wrong the moment the
 * operator changed it, on the page a customer books from. So this one card
 * shape lives in both places, and the duplication is bounded to these few
 * lines rather than to the whole component library.
 */
const TOUR_CARD_RUNTIME = String.raw`
function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

function formatPrice(tour) {
  if (tour.basePrice == null) return "";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: tour.currency || "USD",
      maximumFractionDigits: 0,
    }).format(Number(tour.basePrice));
  } catch (error) {
    return String(tour.basePrice);
  }
}

function formatDuration(tour) {
  if (tour.durationDays) return tour.durationDays + (tour.durationDays === 1 ? " day" : " days");
  if (!tour.durationMinutes) return "";
  var hours = Math.floor(tour.durationMinutes / 60);
  var minutes = tour.durationMinutes % 60;
  if (hours && minutes) return hours + "h " + minutes + "m";
  if (hours) return hours + "h";
  return minutes + "m";
}

function renderTourCard(tour, slot, workspaceSlug, apiOrigin) {
  var href = apiOrigin + "/book/" + encodeURIComponent(workspaceSlug) + "/" + encodeURIComponent(tour.slug);
  var media = tour.coverImageUrl
    ? '<img src="' + escapeHtml(tour.coverImageUrl) + '" alt="' + escapeHtml(tour.title) + '" loading="lazy" decoding="async">'
    : "";
  var meta = [];
  if (slot.showDuration) {
    var duration = formatDuration(tour);
    if (duration) meta.push(escapeHtml(duration));
  }
  if (slot.showPrice) {
    var price = formatPrice(tour);
    if (price) meta.push("From " + escapeHtml(price));
  }
  return (
    '<article class="t-card">' + media +
    '<div class="t-card-body"><h3>' + escapeHtml(tour.title) + "</h3>" +
    (tour.location ? "<p>" + escapeHtml(tour.location) + "</p>" : "") +
    (meta.length ? "<p>" + meta.join(" \u00B7 ") + "</p>" : "") +
    '<a class="t-btn t-btn-primary" href="' + escapeHtml(href) + '">View dates</a>' +
    "</div></article>"
  );
}
`;

const WORKER_RUNTIME = String.raw`
const PAYLOAD = JSON.parse(PAYLOAD_JSON);

${TOUR_CARD_RUNTIME}

/**
 * Live tour data, cached at the edge.
 *
 * 60 seconds is short enough that a price change is visible almost
 * immediately and long enough that a page of six cards does not mean six
 * origin round trips per visitor. A failure returns an empty list rather than
 * an error page: a site whose tour grid is briefly empty is far better than a
 * site that is down because an API call timed out.
 */
async function loadTours(request) {
  const cache = caches.default;
  const cacheKey = new Request(PAYLOAD.apiOrigin + "/api/public/" + PAYLOAD.workspaceSlug + "/tours", request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json().catch(() => ({ tours: [] }));

  const response = await fetch(cacheKey, {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 60, cacheEverything: true },
  }).catch(() => null);
  if (!response || !response.ok) return { tours: [] };

  const clone = new Response(response.body, response);
  clone.headers.set("cache-control", "max-age=60");
  await cache.put(cacheKey, clone.clone());
  return clone.json().catch(() => ({ tours: [] }));
}

function fillTourSlots(html, tours) {
  return html.replace(/<!--TRIPISTIC_TOURS:([a-zA-Z0-9_-]+)-->/g, function (_match, sectionId) {
    const slot = PAYLOAD.tourSlots[sectionId];
    if (!slot) return "";
    let selected = tours;
    if (slot.tourSlugs && slot.tourSlugs.length > 0) {
      const wanted = new Set(slot.tourSlugs);
      selected = tours.filter(function (tour) { return wanted.has(tour.slug); });
    }
    return selected
      .slice(0, slot.limit)
      .map(function (tour) { return renderTourCard(tour, slot, PAYLOAD.workspaceSlug, PAYLOAD.apiOrigin); })
      .join("");
  });
}

function findPage(pathname) {
  const normalised =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return PAYLOAD.pages.find(function (page) { return page.path === normalised; }) || null;
}

/**
 * Security headers on every response.
 *
 * The CSP is strict because it can be: the renderer emits no inline event
 * handlers and no external scripts, so 'self' plus inline styles is enough.
 * frame-ancestors 'none' matters more than it looks — a tenant site framed by
 * an attacker is a clickjacking path onto the booking button.
 */
function withSecurityHeaders(response, noindex) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set(
    "content-security-policy",
    "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'none'; frame-src https:; form-action https:; frame-ancestors 'none'; base-uri 'none'"
  );
  if (noindex) headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, headers });
}

function sitemap() {
  const urls = PAYLOAD.pages
    .filter(function (page) { return !page.noindex; })
    .map(function (page) {
      const loc = PAYLOAD.siteOrigin + (page.path === "/" ? "" : page.path);
      return "<url><loc>" + loc + "</loc></url>";
    })
    .join("");
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + "</urlset>";
}

function robots() {
  if (PAYLOAD.preview) return "User-agent: *\nDisallow: /\n";
  return "User-agent: *\nAllow: /\nSitemap: " + PAYLOAD.siteOrigin + "/sitemap.xml\n";
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return withSecurityHeaders(new Response("Method not allowed", { status: 405 }), true);
    }

    if (url.pathname === "/_tripistic/health") {
      return withSecurityHeaders(
        new Response(
          JSON.stringify({
            ok: true,
            siteId: PAYLOAD.siteId,
            revisionId: PAYLOAD.revisionId,
            deploymentId: PAYLOAD.deploymentId,
            pages: PAYLOAD.pages.length,
          }),
          { headers: { "content-type": "application/json" } }
        ),
        true
      );
    }

    if (url.pathname === "/robots.txt") {
      return withSecurityHeaders(
        new Response(robots(), { headers: { "content-type": "text/plain; charset=utf-8" } }),
        PAYLOAD.preview
      );
    }

    if (url.pathname === "/sitemap.xml") {
      return withSecurityHeaders(
        new Response(sitemap(), { headers: { "content-type": "application/xml; charset=utf-8" } }),
        PAYLOAD.preview
      );
    }

    if (url.pathname === "/llms.txt" && PAYLOAD.llmsTxt) {
      return withSecurityHeaders(
        new Response(PAYLOAD.llmsTxt, { headers: { "content-type": "text/plain; charset=utf-8" } }),
        PAYLOAD.preview
      );
    }

    const page = findPage(url.pathname);
    if (!page) {
      const home = findPage("/");
      const body = home
        ? "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Page not found</title></head><body><h1>Page not found</h1><p><a href=\"/\">Back to the homepage</a></p></body></html>"
        : "Not found";
      return withSecurityHeaders(
        new Response(body, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }),
        true
      );
    }

    let html = page.html;
    if (html.indexOf("<!--TRIPISTIC_TOURS:") !== -1) {
      const data = await loadTours(request);
      html = fillTourSlots(html, Array.isArray(data.tours) ? data.tours : []);
    }

    return withSecurityHeaders(
      new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": PAYLOAD.preview ? "no-store" : "public, max-age=60, s-maxage=300",
        },
      }),
      PAYLOAD.preview || page.noindex
    );
  },
};
`;

/**
 * Produces the Worker module source for a payload.
 *
 * The payload is embedded as a JSON string literal and parsed at startup
 * rather than inlined as an object literal. `JSON.stringify(JSON.stringify(x))`
 * is what makes that safe: the inner call produces JSON, the outer one
 * produces a correctly escaped JavaScript string literal of that JSON. There
 * is no sequence of characters a tenant can put in a page that escapes it.
 */
export function buildWorkerModule(payload: WorkerPayload): string {
  const literal = JSON.stringify(JSON.stringify(payload));
  return `const PAYLOAD_JSON = ${literal};\n${WORKER_RUNTIME}`;
}

/**
 * `llms.txt` for a site.
 *
 * Emitted only when the operator opts in. It is a statement of what the site
 * is and where its content lives — not a ranking mechanism, and the docs say
 * so, because promising otherwise would be selling something nobody can
 * deliver.
 */
export function buildLlmsTxt(input: {
  brandName: string;
  description: string;
  origin: string;
  pages: Array<{ path: string; title: string; noindex: boolean }>;
}): string {
  const lines = [
    `# ${input.brandName}`,
    "",
    input.description,
    "",
    "## Pages",
    ...input.pages
      .filter((page) => !page.noindex)
      .map((page) => `- [${page.title}](${input.origin}${page.path === "/" ? "" : page.path})`),
    "",
    "## Booking",
    "Availability and prices are live; see the linked tour pages for current dates.",
    "",
  ];
  return lines.join("\n");
}

/** Re-exported so the publish pipeline and its tests agree on the token shape. */
export { esc, tourSlotToken };
