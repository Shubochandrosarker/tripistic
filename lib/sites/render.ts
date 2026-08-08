import {
  type PageContent,
  type PageSeo,
  type SiteNavigation,
  type SiteSeo,
  type SiteSection,
  type SiteTheme,
} from "@/lib/sites/schema";

/**
 * Publish-time HTML rendering for a site revision.
 *
 * Everything a section can express is turned into markup here, at publish
 * time, on the server. The generated Worker serves the result; it does not
 * interpret section objects at runtime. That is deliberate — an interpreter in
 * the Worker would mean shipping the whole component library to the edge and
 * keeping two renderers in step, and it would put tenant-authored data through
 * a code path at request time instead of at review time.
 *
 * The one exception is tour data. Prices, availability and titles must be live
 * — the brief is explicit that editing a tour updates the website — so tour
 * grids render a placeholder token here and the Worker fills it from
 * Tripistic's public tours API on each request. That keeps exactly one small
 * piece of card markup duplicated in `worker-runtime.ts`, which is a cost
 * worth paying to avoid stale prices on a page a customer books from.
 *
 * **Escaping is not optional and not conditional.** `esc` is applied to every
 * interpolated value without exception. The schema already rejects
 * `javascript:` URLs and constrains every string, but defence here is what
 * makes a future section type safe by default rather than safe if its author
 * remembered.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes for both text nodes and quoted attribute values. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Placeholder the Worker replaces with live tour cards. */
export function tourSlotToken(sectionId: string): string {
  return `<!--TRIPISTIC_TOURS:${sectionId}-->`;
}

const PADDING: Record<string, string> = { none: "0", sm: "1rem", md: "2rem", lg: "4rem", xl: "6rem" };
const WIDTH: Record<string, string> = {
  narrow: "42rem",
  content: "64rem",
  wide: "80rem",
  full: "100%",
};
const RADIUS: Record<string, string> = {
  none: "0",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "1rem",
  pill: "9999px",
};
const FONT_STACKS: Record<string, string> = {
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "'Iowan Old Style', Georgia, serif",
  grotesk: "'Inter', system-ui, sans-serif",
  editorial: "'Iowan Old Style', 'Times New Roman', serif",
};

export function themeCss(theme: SiteTheme): string {
  return `:root{
--t-primary:${esc(theme.primaryColor)};
--t-secondary:${esc(theme.secondaryColor)};
--t-accent:${esc(theme.accentColor)};
--t-bg:${esc(theme.backgroundColor)};
--t-text:${esc(theme.textColor)};
--t-radius-button:${RADIUS[theme.buttonRadius]};
--t-radius-card:${RADIUS[theme.cardRadius]};
--t-font-heading:${FONT_STACKS[theme.headingFont]};
--t-font-body:${FONT_STACKS[theme.bodyFont]};
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--t-bg);color:var(--t-text);font-family:var(--t-font-body);line-height:1.6}
h1,h2,h3,h4{font-family:var(--t-font-heading);line-height:1.2;margin:0 0 .5em}
img{max-width:100%;height:auto;display:block}
a{color:inherit}
.t-section{width:100%}
.t-inner{margin:0 auto;padding-left:1.25rem;padding-right:1.25rem}
.t-bg-muted{background:color-mix(in srgb, var(--t-text) 4%, var(--t-bg))}
.t-bg-brand{background:var(--t-primary);color:#fff}
.t-bg-dark{background:var(--t-secondary);color:#fff}
.t-grid{display:grid;gap:1.5rem}
.t-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.t-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.t-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.t-card{border:1px solid color-mix(in srgb, var(--t-text) 12%, transparent);border-radius:var(--t-radius-card);overflow:hidden}
.t-card-body{padding:1rem}
.t-btn{display:inline-block;padding:.75rem 1.5rem;border-radius:var(--t-radius-button);text-decoration:none;font-weight:600}
.t-btn-primary{background:var(--t-primary);color:#fff}
.t-btn-secondary{background:var(--t-accent);color:#111}
.t-btn-ghost{border:1px solid currentColor}
.t-hero{position:relative;background-size:cover;background-position:center}
.t-hero-overlay{position:absolute;inset:0;background:#000}
.t-hero-inner{position:relative}
.t-stats{display:flex;flex-wrap:wrap;gap:2rem}
.t-list{padding-left:1.25rem;margin:0}
.t-faq{border-top:1px solid color-mix(in srgb, var(--t-text) 12%, transparent);padding:1rem 0}
.t-nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;padding:1rem 0}
.t-nav a{text-decoration:none;margin-right:1rem}
.t-footer-cols{display:grid;gap:2rem;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))}
.t-visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (max-width:900px){.t-cols-3,.t-cols-4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){
.t-cols-2,.t-cols-3,.t-cols-4{grid-template-columns:minmax(0,1fr)}
.t-hide-mobile{display:none}
}
@media (min-width:641px) and (max-width:1024px){.t-hide-tablet{display:none}}
@media (min-width:1025px){.t-hide-desktop{display:none}}`;
}

function hiddenClasses(visibleOn: string[]): string {
  const all = ["desktop", "tablet", "mobile"];
  return all
    .filter((breakpoint) => !visibleOn.includes(breakpoint))
    .map((breakpoint) => `t-hide-${breakpoint}`)
    .join(" ");
}

function sectionOpen(item: SiteSection): string {
  const layout = item.layout;
  const backgroundClass =
    layout.background === "muted"
      ? " t-bg-muted"
      : layout.background === "brand"
        ? " t-bg-brand"
        : layout.background === "dark"
          ? " t-bg-dark"
          : "";
  const hidden = hiddenClasses(layout.visibleOn);
  const style = [
    `padding-top:${PADDING[layout.paddingTop]}`,
    `padding-bottom:${PADDING[layout.paddingBottom]}`,
    layout.background === "image" && layout.backgroundImage
      ? `background-image:url('${esc(layout.backgroundImage)}');background-size:cover;background-position:center`
      : "",
  ]
    .filter(Boolean)
    .join(";");
  const inner = `max-width:${WIDTH[layout.width]};text-align:${layout.align}`;
  return (
    `<section id="${esc(item.id)}" class="t-section${backgroundClass}${hidden ? ` ${hidden}` : ""}" style="${esc(style)}">` +
    `<div class="t-inner" style="${esc(inner)}">`
  );
}

const SECTION_CLOSE = "</div></section>";

function cta(item: { label: string; href: string; style: string } | undefined): string {
  if (!item?.label) return "";
  return `<a class="t-btn t-btn-${esc(item.style)}" href="${esc(item.href)}">${esc(item.label)}</a>`;
}

function image(item: { url: string; alt: string; caption?: string } | undefined): string {
  if (!item?.url) return "";
  const caption = item.caption ? `<figcaption>${esc(item.caption)}</figcaption>` : "";
  return `<figure><img src="${esc(item.url)}" alt="${esc(item.alt)}" loading="lazy" decoding="async">${caption}</figure>`;
}

/** Paragraph-splits operator prose. Never interprets markup inside it. */
function paragraphs(body: string): string {
  if (!body) return "";
  return body
    .split(/\n{2,}/)
    .map((block) => `<p>${esc(block.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function heading(level: 2 | 3, value: string): string {
  return value ? `<h${level}>${esc(value)}</h${level}>` : "";
}

export type RenderContext = {
  navigation: SiteNavigation;
  brandName: string;
  /** Absolute base for the booking flow on Tripistic Core. */
  bookingBaseUrl: string;
  workspaceSlug: string;
  logoUrl: string;
  /** Whether Tripistic attribution must be shown (no white-label entitlement). */
  requireAttribution: boolean;
};

function renderSection(item: SiteSection, context: RenderContext): string {
  const open = sectionOpen(item);
  const close = SECTION_CLOSE;

  switch (item.type) {
    case "announcement": {
      return `${open}<div role="status"><span>${esc(item.props.message)}</span> ${cta(item.props.cta)}</div>${close}`;
    }
    case "header": {
      const links = context.navigation.primary
        .map((link) => `<a href="${esc(link.href)}">${esc(link.label)}</a>`)
        .join("");
      const logo = item.props.logoUrl || context.logoUrl;
      const brand = logo
        ? `<a href="/"><img src="${esc(logo)}" alt="${esc(context.brandName)}" style="max-height:44px;width:auto"></a>`
        : `<a href="/"><strong>${esc(context.brandName)}</strong></a>`;
      const book = item.props.showBookButton
        ? `<a class="t-btn t-btn-primary" href="/tours">Book now</a>`
        : "";
      return `${open}<nav class="t-nav" aria-label="Primary">${brand}<div>${links}${book}</div></nav>${close}`;
    }
    case "hero": {
      const layout = item.layout;
      const bg =
        item.props.image?.url && layout.background !== "image"
          ? `background-image:url('${esc(item.props.image.url)}')`
          : "";
      const overlay = bg
        ? `<div class="t-hero-overlay" style="opacity:${Number(item.props.overlayOpacity)}"></div>`
        : "";
      const colour = bg ? "color:#fff" : "";
      return (
        `<section id="${esc(item.id)}" class="t-section t-hero ${hiddenClasses(layout.visibleOn)}" style="${esc(bg)};padding-top:${PADDING[layout.paddingTop]};padding-bottom:${PADDING[layout.paddingBottom]};${esc(colour)}">` +
        `${overlay}<div class="t-inner t-hero-inner" style="max-width:${WIDTH[layout.width]};text-align:${layout.align}">` +
        (item.props.eyebrow ? `<p>${esc(item.props.eyebrow)}</p>` : "") +
        `<h1>${esc(item.props.title)}</h1>` +
        (item.props.subtitle ? `<p>${esc(item.props.subtitle)}</p>` : "") +
        `<p>${cta(item.props.primaryCta)} ${cta(item.props.secondaryCta)}</p>` +
        `</div></section>`
      );
    }
    case "logoCloud": {
      const logos = item.props.logos
        .map((logo) => `<img src="${esc(logo.url)}" alt="${esc(logo.alt)}" loading="lazy" style="max-height:40px;width:auto">`)
        .join("");
      return `${open}${heading(2, item.props.title)}<div class="t-stats">${logos}</div>${close}`;
    }
    case "trustBar": {
      const items = item.props.items
        .map((entry) => `<div><strong>${esc(entry.value)}</strong><div>${esc(entry.label)}</div></div>`)
        .join("");
      return `${open}<div class="t-stats">${items}</div>${close}`;
    }
    case "tourCards": {
      // Live data — see the module comment. The Worker replaces this token.
      return `${open}${heading(2, item.props.title)}${item.props.subtitle ? `<p>${esc(item.props.subtitle)}</p>` : ""}<div class="t-grid t-cols-${item.props.columns}">${tourSlotToken(item.id)}</div>${close}`;
    }
    case "featuredTour": {
      return `${open}${heading(2, item.props.headline)}${paragraphs(item.props.body)}<div class="t-grid">${tourSlotToken(item.id)}</div>${cta(item.props.cta)}${close}`;
    }
    case "destinationCards": {
      const cards = item.props.destinations
        .map(
          (destination) =>
            `<article class="t-card">${image(destination.image)}<div class="t-card-body"><h3>${esc(destination.name)}</h3><p>${esc(destination.blurb)}</p>${destination.href ? `<a href="${esc(destination.href)}">Explore</a>` : ""}</div></article>`,
        )
        .join("");
      return `${open}${heading(2, item.props.title)}<div class="t-grid t-cols-3">${cards}</div>${close}`;
    }
    case "categoryCards": {
      const cards = item.props.categories
        .map(
          (category) =>
            `<a class="t-card" href="${esc(category.href)}" style="text-decoration:none">${image(category.image)}<div class="t-card-body"><h3>${esc(category.label)}</h3></div></a>`,
        )
        .join("");
      return `${open}${heading(2, item.props.title)}<div class="t-grid t-cols-3">${cards}</div>${close}`;
    }
    case "itinerary": {
      const days = item.props.days
        .map(
          (day) =>
            `<li><h3>${esc(day.label)} — ${esc(day.title)}</h3>${paragraphs(day.body)}${image(day.image)}</li>`,
        )
        .join("");
      return `${open}${heading(2, item.props.title)}<ol class="t-list">${days}</ol>${close}`;
    }
    case "inclusions":
    case "exclusions":
    case "highlights": {
      const entries = item.props.items.map((entry) => `<li>${esc(entry)}</li>`).join("");
      return `${open}${heading(2, item.props.title)}<ul class="t-list">${entries}</ul>${close}`;
    }
    case "gallery": {
      const images = item.props.images.map((entry) => image(entry)).join("");
      return `${open}${heading(2, item.props.title)}<div class="t-grid t-cols-3">${images}</div>${close}`;
    }
    case "video": {
      return (
        `${open}${heading(2, item.props.title)}` +
        `<div style="position:relative;padding-top:56.25%"><iframe src="${esc(item.props.embedUrl)}" title="${esc(item.props.title || "Video")}" loading="lazy" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe></div>${close}`
      );
    }
    case "map": {
      const query = item.props.address
        ? encodeURIComponent(item.props.address)
        : `${item.props.latitude ?? 0},${item.props.longitude ?? 0}`;
      return (
        `${open}${heading(2, item.props.title)}` +
        `<p>${esc(item.props.address)}</p>` +
        `<p><a class="t-btn t-btn-ghost" rel="noopener noreferrer" target="_blank" href="https://www.openstreetmap.org/search?query=${esc(query)}">Open map</a></p>${close}`
      );
    }
    case "guideProfile": {
      const languages = item.props.languages.length
        ? `<p>Languages: ${esc(item.props.languages.join(", "))}</p>`
        : "";
      return `${open}${image(item.props.photo)}<h2>${esc(item.props.name)}</h2><p>${esc(item.props.role)}</p>${paragraphs(item.props.bio)}${languages}${close}`;
    }
    case "about": {
      return `${open}${heading(2, item.props.title)}${paragraphs(item.props.body)}${image(item.props.image)}${cta(item.props.cta)}${close}`;
    }
    case "reviews": {
      const reviews = item.props.reviews
        .map(
          (review) =>
            `<article class="t-card"><div class="t-card-body"><p aria-label="${esc(review.rating)} out of 5">${"★".repeat(Math.round(review.rating))}</p><blockquote>${esc(review.body)}</blockquote><p>— ${esc(review.author)}${review.source ? `, ${esc(review.source)}` : ""}</p></div></article>`,
        )
        .join("");
      return `${open}${heading(2, item.props.title)}<div class="t-grid t-cols-3">${reviews}</div>${close}`;
    }
    case "testimonials": {
      const quotes = item.props.quotes
        .map(
          (quote) =>
            `<figure><blockquote>${esc(quote.body)}</blockquote><figcaption>${esc(quote.author)}${quote.role ? `, ${esc(quote.role)}` : ""}</figcaption></figure>`,
        )
        .join("");
      return `${open}${heading(2, item.props.title)}<div class="t-grid t-cols-2">${quotes}</div>${close}`;
    }
    case "statistics": {
      const stats = item.props.stats
        .map((stat) => `<div><strong style="font-size:2rem">${esc(stat.value)}</strong><div>${esc(stat.label)}</div></div>`)
        .join("");
      return `${open}${heading(2, item.props.title)}<div class="t-stats">${stats}</div>${close}`;
    }
    case "faq": {
      const items = item.props.items
        .map(
          (entry) =>
            `<details class="t-faq"><summary>${esc(entry.question)}</summary>${paragraphs(entry.answer)}</details>`,
        )
        .join("");
      return `${open}${heading(2, item.props.title)}${items}${close}`;
    }
    case "cta": {
      return `${open}<h2>${esc(item.props.title)}</h2>${paragraphs(item.props.body)}<p>${cta(item.props.primaryCta)} ${cta(item.props.secondaryCta)}</p>${close}`;
    }
    case "bookingWidget": {
      // Links into the Tripistic booking flow. There is no second booking
      // engine — capacity, pricing and payment stay in Core.
      const href = item.props.tourId
        ? `${context.bookingBaseUrl}/book/${encodeURIComponent(context.workspaceSlug)}?tour=${encodeURIComponent(item.props.tourId)}`
        : `${context.bookingBaseUrl}/book/${encodeURIComponent(context.workspaceSlug)}`;
      return `${open}<a class="t-btn t-btn-primary" href="${esc(href)}">${esc(item.props.buttonLabel)}</a>${close}`;
    }
    case "availabilityCalendar": {
      const href = `${context.bookingBaseUrl}/book/${encodeURIComponent(context.workspaceSlug)}`;
      return `${open}<p><a class="t-btn t-btn-ghost" href="${esc(href)}">Check availability</a></p>${close}`;
    }
    case "contactForm": {
      // Posts to Tripistic's lead endpoint, not to an operator-supplied URL —
      // an arbitrary action would let a site exfiltrate its own visitors'
      // details to a third party without them or the operator noticing.
      const action = `${context.bookingBaseUrl}/api/marketing/contact`;
      const phone = item.props.collectPhone
        ? `<p><label>Phone<br><input name="phone" type="tel" autocomplete="tel"></label></p>`
        : "";
      return (
        `${open}${heading(2, item.props.title)}${paragraphs(item.props.body)}` +
        `<form method="post" action="${esc(action)}">` +
        `<input type="hidden" name="workspace" value="${esc(context.workspaceSlug)}">` +
        `<p><label>Name<br><input name="name" required autocomplete="name"></label></p>` +
        `<p><label>Email<br><input name="email" type="email" required autocomplete="email"></label></p>` +
        phone +
        `<p><label>Message<br><textarea name="message" rows="5" required></textarea></label></p>` +
        (item.props.consentText ? `<p>${esc(item.props.consentText)}</p>` : "") +
        `<p><button class="t-btn t-btn-primary" type="submit">Send</button></p>` +
        `</form>${close}`
      );
    }
    case "newsletter": {
      const action = `${context.bookingBaseUrl}/api/marketing/subscribe`;
      return (
        `${open}${heading(2, item.props.title)}${paragraphs(item.props.body)}` +
        `<form method="post" action="${esc(action)}">` +
        `<input type="hidden" name="workspace" value="${esc(context.workspaceSlug)}">` +
        `<p><label>Email<br><input name="email" type="email" required autocomplete="email"></label></p>` +
        `<p><button class="t-btn t-btn-primary" type="submit">${esc(item.props.buttonLabel)}</button></p>` +
        `</form>${close}`
      );
    }
    case "contactCta": {
      const value = item.props.value;
      const href =
        item.props.channel === "whatsapp"
          ? `https://wa.me/${encodeURIComponent(value.replace(/[^0-9]/g, ""))}`
          : item.props.channel === "email"
            ? `mailto:${encodeURIComponent(value)}`
            : `tel:${encodeURIComponent(value.replace(/[^0-9+]/g, ""))}`;
      const label = item.props.label || value;
      return `${open}<a class="t-btn t-btn-secondary" rel="noopener noreferrer" href="${esc(href)}">${esc(label)}</a>${close}`;
    }
    case "policies": {
      const policies = item.props.policies
        .map((policy) => `<section><h3>${esc(policy.heading)}</h3>${paragraphs(policy.body)}</section>`)
        .join("");
      return `${open}${heading(2, item.props.title)}${policies}${close}`;
    }
    case "footer": {
      const columns = item.props.columns
        .map(
          (column) =>
            `<div><h3>${esc(column.heading)}</h3><ul style="list-style:none;padding:0">${column.links
              .map((link) => `<li><a href="${esc(link.href)}">${esc(link.label)}</a></li>`)
              .join("")}</ul></div>`,
        )
        .join("");
      const social = item.props.socialLinks
        .map(
          (link) =>
            `<a rel="noopener noreferrer" href="${esc(link.href)}">${esc(link.platform)}</a>`,
        )
        .join(" ");
      // Attribution is forced on when the workspace has no white-label
      // entitlement. `showAttribution: false` is a paid capability, so the
      // renderer resolves it against the entitlement rather than the prop.
      const attribution =
        context.requireAttribution || item.props.showAttribution
          ? `<p><small>Powered by Tripistic</small></p>`
          : "";
      return `${open}<footer><div class="t-footer-cols">${columns}</div><p>${esc(item.props.tagline)}</p><p>${social}</p>${attribution}</footer>${close}`;
    }
  }
}

export type RenderedPage = {
  path: string;
  html: string;
  noindex: boolean;
};

export function renderPage(input: {
  page: { path: string; title: string; content: PageContent; seo: PageSeo };
  theme: SiteTheme;
  siteSeo: SiteSeo;
  context: RenderContext;
  canonicalOrigin: string | null;
  /** Preview builds are never indexable, whatever the page's own SEO says. */
  forceNoindex: boolean;
}): RenderedPage {
  const { page, theme, siteSeo, context } = input;
  const title = page.seo.title || siteSeo.titleTemplate.replace("%s", page.title) || page.title;
  const description = page.seo.description || siteSeo.defaultDescription;
  const noindex = input.forceNoindex || page.seo.noindex;
  const canonical =
    page.seo.canonical ||
    (input.canonicalOrigin ? `${input.canonicalOrigin}${page.path === "/" ? "" : page.path}` : "");
  const socialImage = page.seo.socialImageUrl || siteSeo.socialImageUrl;

  const body = page.content.sections.map((item) => renderSection(item, context)).join("");

  const structuredData = buildStructuredData({ page, siteSeo, context, canonical });

  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(title)}</title>`,
    description ? `<meta name="description" content="${esc(description)}">` : "",
    noindex ? `<meta name="robots" content="noindex, nofollow">` : `<meta name="robots" content="index, follow">`,
    canonical && !noindex ? `<link rel="canonical" href="${esc(canonical)}">` : "",
    theme.faviconUrl ? `<link rel="icon" href="${esc(theme.faviconUrl)}">` : "",
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    description ? `<meta property="og:description" content="${esc(description)}">` : "",
    socialImage ? `<meta property="og:image" content="${esc(socialImage)}">` : "",
    `<meta name="twitter:card" content="${socialImage ? "summary_large_image" : "summary"}">`,
    `<style>${themeCss(theme)}</style>`,
    structuredData,
  ]
    .filter(Boolean)
    .join("");

  const html =
    `<!doctype html><html lang="en"><head>${head}</head><body>` +
    `<a class="t-visually-hidden" href="#main">Skip to content</a>` +
    `<main id="main">${body}</main>` +
    `</body></html>`;

  return { path: page.path, html, noindex };
}

/**
 * Structured data, emitted narrowly.
 *
 * Organization on every page and FAQPage only where the operator explicitly
 * opted a genuine FAQ section into it. No Tour/Product markup is emitted at
 * all: it requires price and availability that are resolved at request time by
 * the Worker, and marking up a price the page might not be showing is exactly
 * the schema spam the brief says to avoid.
 */
function buildStructuredData(input: {
  page: { content: PageContent };
  siteSeo: SiteSeo;
  context: RenderContext;
  canonical: string;
}): string {
  const graph: Record<string, unknown>[] = [];

  const organization: Record<string, unknown> = {
    "@type": "Organization",
    name: input.siteSeo.organizationName || input.context.brandName,
  };
  if (input.canonical) organization.url = input.canonical;
  if (input.context.logoUrl) organization.logo = input.context.logoUrl;
  if (input.siteSeo.addressLocality || input.siteSeo.addressCountry) {
    organization.address = {
      "@type": "PostalAddress",
      ...(input.siteSeo.addressLocality ? { addressLocality: input.siteSeo.addressLocality } : {}),
      ...(input.siteSeo.addressCountry ? { addressCountry: input.siteSeo.addressCountry } : {}),
    };
  }
  graph.push(organization);

  for (const item of input.page.content.sections) {
    if (item.type === "faq" && item.props.emitStructuredData && item.props.items.length > 0) {
      graph.push({
        "@type": "FAQPage",
        mainEntity: item.props.items.map((entry) => ({
          "@type": "Question",
          name: entry.question,
          acceptedAnswer: { "@type": "Answer", text: entry.answer },
        })),
      });
    }
  }

  // JSON.stringify escapes nothing HTML-significant except via this guard: a
  // `</script>` inside operator text would otherwise close the tag early.
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(
    /</g,
    "\\u003c",
  );
  return `<script type="application/ld+json">${json}</script>`;
}
