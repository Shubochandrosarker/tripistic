import { z } from "zod";

/**
 * The Site Builder content schema.
 *
 * The single most important decision here: **a page is a validated array of
 * typed sections, never a blob of HTML.** Everything else follows from that.
 *
 * A tenant website is authored by an operator (and increasingly by a language
 * model on their behalf) and then served from a hostname that also serves the
 * booking widget. If pages stored arbitrary markup, every one of them would be
 * a stored-XSS vector against that operator's own customers, and an LLM that
 * can write page content would be an LLM that can write script tags. With a
 * closed set of section types and Zod-validated props, the worst a bad
 * generation can produce is an ugly page: the renderer only ever emits markup
 * it constructed itself from escaped values.
 *
 * The second decision: **sections reference Tripistic records, they do not
 * copy them.** A `tourCards` section stores `tourIds`, not titles and prices.
 * Changing a tour's price in the dashboard changes the website, because the
 * website never had its own copy to go stale. This is also why there is no
 * booking logic in any section — `bookingWidget` names a tour and the existing
 * booking engine does the rest.
 */

export const SITE_CONTENT_VERSION = 1;

/* ------------------------------------------------------------------------ */
/* Primitives                                                                */
/* ------------------------------------------------------------------------ */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour.");

/**
 * A URL that will be emitted into an `href` or `src`.
 *
 * Only http(s). Rejecting `javascript:` and `data:` here rather than at render
 * time means one check covers every section type, including ones added later
 * by someone who did not read the renderer.
 */
const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) => {
      if (value === "") return true;
      try {
        const parsed = new URL(value, "https://placeholder.invalid");
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Only http(s) links are allowed." },
  );

/** An internal path or an absolute http(s) URL. */
const linkTarget = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => value === "" || value.startsWith("/") || /^https?:\/\//i.test(value), {
    message: "Links must be a site path starting with / or an http(s) URL.",
  });

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().default("");

const idRef = z.string().trim().min(1).max(64);

const ctaSchema = z.object({
  label: text(60),
  href: linkTarget,
  style: z.enum(["primary", "secondary", "ghost"]).default("primary"),
});

const imageSchema = z.object({
  url: safeUrl,
  /**
   * Required, not optional. An image with no alternative text fails the
   * accessibility gate the brief sets, and making it a required field is the
   * only reliable way to get one — an optional field is an empty field.
   * Decorative images pass an empty string deliberately.
   */
  alt: text(200),
  caption: optionalText(200),
});

/** Layout controls every section shares. Kept flat so the editor can be generic. */
const layoutSchema = z
  .object({
    paddingTop: z.enum(["none", "sm", "md", "lg", "xl"]).default("lg"),
    paddingBottom: z.enum(["none", "sm", "md", "lg", "xl"]).default("lg"),
    width: z.enum(["narrow", "content", "wide", "full"]).default("content"),
    align: z.enum(["left", "center", "right"]).default("left"),
    background: z.enum(["surface", "muted", "brand", "dark", "image"]).default("surface"),
    backgroundImage: safeUrl.optional().default(""),
    /** Breakpoints this section renders at. Empty array is not allowed. */
    visibleOn: z
      .array(z.enum(["desktop", "tablet", "mobile"]))
      .min(1)
      .default(["desktop", "tablet", "mobile"]),
  })
  .default({});

function section<TType extends string, T extends z.ZodRawShape>(type: TType, props: T) {
  return z.object({
    id: z.string().trim().min(1).max(64),
    type: z.literal(type),
    /**
     * Excluded from the rendered page entirely.
     *
     * Distinct from `layout.visibleOn`, which hides a section at some
     * breakpoints and cannot express "hidden everywhere" — the array requires
     * at least one entry, deliberately, so that a section is never invisible on
     * every device by accident. Draft-and-hide is a different intent and needs
     * its own flag: the operator wants the content kept but not published yet.
     *
     * The renderer drops hidden sections rather than emitting them with
     * `display:none`, so their text never reaches the page source. Hiding a
     * section that mentions next season's pricing should not leave that pricing
     * readable in view-source.
     */
    hidden: z.boolean().default(false),
    layout: layoutSchema,
    props: z.object(props),
  });
}

/* ------------------------------------------------------------------------ */
/* Section library                                                           */
/* ------------------------------------------------------------------------ */

const announcementSection = section("announcement", {
  message: text(200),
  cta: ctaSchema.optional(),
  dismissible: z.boolean().default(true),
});

const headerSection = section("header", {
  logoUrl: safeUrl.optional().default(""),
  showBookButton: z.boolean().default(true),
  sticky: z.boolean().default(true),
});

const heroSection = section("hero", {
  eyebrow: optionalText(80),
  title: text(140).min(2),
  subtitle: optionalText(400),
  image: imageSchema.optional(),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
  overlayOpacity: z.number().min(0).max(1).default(0.35),
});

const logoCloudSection = section("logoCloud", {
  title: optionalText(120),
  logos: z.array(imageSchema).max(12).default([]),
});

const trustBarSection = section("trustBar", {
  items: z
    .array(z.object({ label: text(60), value: text(40), icon: optionalText(40) }))
    .max(6)
    .default([]),
});

/**
 * Tour, destination and category cards all reference records by id.
 *
 * `limit` exists because an operator with 300 tours should not be able to
 * build a page that renders 300 cards; the renderer clamps to it and the
 * schema bounds it.
 */
const tourCardsSection = section("tourCards", {
  title: optionalText(120),
  subtitle: optionalText(300),
  tourIds: z.array(idRef).max(24).default([]),
  /** When no ids are given, fill from the workspace's active tours. */
  autoFill: z.boolean().default(true),
  limit: z.number().int().min(1).max(24).default(6),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  showPrice: z.boolean().default(true),
  showDuration: z.boolean().default(true),
});

const featuredTourSection = section("featuredTour", {
  tourId: idRef.optional(),
  headline: optionalText(140),
  body: optionalText(1200),
  cta: ctaSchema.optional(),
});

const destinationCardsSection = section("destinationCards", {
  title: optionalText(120),
  destinations: z
    .array(
      z.object({
        name: text(80),
        image: imageSchema.optional(),
        href: linkTarget.optional().default(""),
        blurb: optionalText(240),
      }),
    )
    .max(12)
    .default([]),
});

const categoryCardsSection = section("categoryCards", {
  title: optionalText(120),
  categories: z
    .array(z.object({ label: text(60), href: linkTarget, image: imageSchema.optional() }))
    .max(12)
    .default([]),
});

const itinerarySection = section("itinerary", {
  title: optionalText(120),
  days: z
    .array(
      z.object({
        label: text(60),
        title: text(140),
        body: optionalText(1500),
        image: imageSchema.optional(),
      }),
    )
    .max(30)
    .default([]),
});

const listSection = <TType extends string>(type: TType) =>
  section(type, {
    title: optionalText(120),
    items: z.array(text(240)).max(30).default([]),
  });

const inclusionsSection = listSection("inclusions");
const exclusionsSection = listSection("exclusions");
const highlightsSection = listSection("highlights");

const gallerySection = section("gallery", {
  title: optionalText(120),
  images: z.array(imageSchema).max(30).default([]),
  layout: z.enum(["grid", "masonry", "carousel"]).default("grid"),
});

const videoSection = section("video", {
  title: optionalText(120),
  /** Provider-agnostic embed URL; validated as http(s) like every other URL. */
  embedUrl: safeUrl,
  poster: imageSchema.optional(),
});

const mapSection = section("map", {
  title: optionalText(120),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: optionalText(240),
  zoom: z.number().int().min(1).max(20).default(13),
});

const guideProfileSection = section("guideProfile", {
  name: text(120),
  role: optionalText(80),
  bio: optionalText(1500),
  photo: imageSchema.optional(),
  languages: z.array(text(40)).max(12).default([]),
  /** References a workspace member when the profile is a real guide record. */
  memberId: idRef.optional(),
});

const aboutSection = section("about", {
  title: optionalText(120),
  body: optionalText(4000),
  image: imageSchema.optional(),
  cta: ctaSchema.optional(),
});

const reviewsSection = section("reviews", {
  title: optionalText(120),
  reviews: z
    .array(
      z.object({
        author: text(80),
        rating: z.number().min(1).max(5),
        body: text(800),
        date: optionalText(40),
        source: optionalText(60),
      }),
    )
    .max(24)
    .default([]),
});

const testimonialsSection = section("testimonials", {
  title: optionalText(120),
  quotes: z
    .array(z.object({ author: text(80), role: optionalText(80), body: text(600) }))
    .max(12)
    .default([]),
});

const statisticsSection = section("statistics", {
  title: optionalText(120),
  stats: z
    .array(z.object({ value: text(24), label: text(80) }))
    .max(6)
    .default([]),
});

const faqSection = section("faq", {
  title: optionalText(120),
  items: z.array(z.object({ question: text(240), answer: text(2000) })).max(30).default([]),
  /**
   * Whether to emit FAQPage structured data. Off by default: FAQ rich results
   * only apply to genuine question/answer content, and marking up a page that
   * is really a features list is the schema spam the brief says to avoid.
   */
  emitStructuredData: z.boolean().default(false),
});

const ctaSection = section("cta", {
  title: text(140),
  body: optionalText(400),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
});

/**
 * Renders the existing Tripistic booking flow. There is no second booking
 * engine: capacity, pricing and payment all stay in Tripistic Core, and this
 * section only says which tour and how the entry point should look.
 */
const bookingWidgetSection = section("bookingWidget", {
  tourId: idRef.optional(),
  mode: z.enum(["inline", "modal", "button"]).default("inline"),
  buttonLabel: text(40).default("Book now"),
  showAvailability: z.boolean().default(true),
});

const availabilityCalendarSection = section("availabilityCalendar", {
  tourId: idRef.optional(),
  monthsVisible: z.number().int().min(1).max(3).default(1),
});

const contactFormSection = section("contactForm", {
  title: optionalText(120),
  body: optionalText(400),
  /** Posts to the workspace's lead-capture endpoint, not to an arbitrary URL. */
  collectPhone: z.boolean().default(false),
  consentText: optionalText(400),
});

const newsletterSection = section("newsletter", {
  title: optionalText(120),
  body: optionalText(300),
  buttonLabel: text(40).default("Subscribe"),
});

const contactCtaSection = section("contactCta", {
  channel: z.enum(["whatsapp", "email", "phone"]),
  /** Handle, address or number; the renderer builds the scheme itself. */
  value: text(120),
  label: optionalText(60),
});

const policiesSection = section("policies", {
  title: optionalText(120),
  policies: z.array(z.object({ heading: text(120), body: text(4000) })).max(12).default([]),
});

const footerSection = section("footer", {
  tagline: optionalText(200),
  columns: z
    .array(
      z.object({
        heading: text(60),
        links: z.array(z.object({ label: text(60), href: linkTarget })).max(10).default([]),
      }),
    )
    .max(4)
    .default([]),
  showAttribution: z.boolean().default(true),
  socialLinks: z
    .array(z.object({ platform: text(40), href: safeUrl }))
    .max(8)
    .default([]),
});

export const siteSectionSchema = z.discriminatedUnion("type", [
  announcementSection,
  headerSection,
  heroSection,
  logoCloudSection,
  trustBarSection,
  tourCardsSection,
  featuredTourSection,
  destinationCardsSection,
  categoryCardsSection,
  itinerarySection,
  inclusionsSection,
  exclusionsSection,
  highlightsSection,
  gallerySection,
  videoSection,
  mapSection,
  guideProfileSection,
  aboutSection,
  reviewsSection,
  testimonialsSection,
  statisticsSection,
  faqSection,
  ctaSection,
  bookingWidgetSection,
  availabilityCalendarSection,
  contactFormSection,
  newsletterSection,
  contactCtaSection,
  policiesSection,
  footerSection,
]);

export type SiteSection = z.infer<typeof siteSectionSchema>;
export type SiteSectionType = SiteSection["type"];

export const SITE_SECTION_TYPES = siteSectionSchema.options.map(
  (option) => option.shape.type.value,
) as SiteSectionType[];

/* ------------------------------------------------------------------------ */
/* Page, theme, SEO, navigation                                              */
/* ------------------------------------------------------------------------ */

export const pageContentSchema = z.object({
  version: z.literal(SITE_CONTENT_VERSION),
  /**
   * Capped at 60. Not an arbitrary number: a page long enough to exceed it is
   * one nobody will read, and an unbounded array is a way to make the
   * publish renderer allocate until it falls over.
   */
  sections: z.array(siteSectionSchema).max(60),
});

export type PageContent = z.infer<typeof pageContentSchema>;

export const pageSeoSchema = z.object({
  title: text(70).optional().default(""),
  description: text(180).optional().default(""),
  canonical: safeUrl.optional().default(""),
  socialImageUrl: safeUrl.optional().default(""),
  noindex: z.boolean().default(false),
});

export type PageSeo = z.infer<typeof pageSeoSchema>;

export const siteThemeSchema = z.object({
  logoLightUrl: safeUrl.optional().default(""),
  logoDarkUrl: safeUrl.optional().default(""),
  faviconUrl: safeUrl.optional().default(""),
  primaryColor: hexColor.default("#0f766e"),
  secondaryColor: hexColor.default("#0f172a"),
  accentColor: hexColor.default("#f59e0b"),
  backgroundColor: hexColor.default("#ffffff"),
  textColor: hexColor.default("#111827"),
  headingFont: z.enum(["system", "serif", "grotesk", "editorial"]).default("system"),
  bodyFont: z.enum(["system", "serif", "grotesk"]).default("system"),
  buttonRadius: z.enum(["none", "sm", "md", "lg", "pill"]).default("md"),
  cardRadius: z.enum(["none", "sm", "md", "lg"]).default("md"),
  mode: z.enum(["light", "dark"]).default("light"),
});

export type SiteTheme = z.infer<typeof siteThemeSchema>;

export const siteNavigationSchema = z.object({
  primary: z
    .array(z.object({ label: text(40), href: linkTarget }))
    .max(10)
    .default([]),
  footer: z
    .array(z.object({ label: text(40), href: linkTarget }))
    .max(20)
    .default([]),
});

export type SiteNavigation = z.infer<typeof siteNavigationSchema>;

export const siteSeoSchema = z.object({
  defaultTitle: text(70).optional().default(""),
  titleTemplate: text(70).optional().default("%s"),
  defaultDescription: text(180).optional().default(""),
  socialImageUrl: safeUrl.optional().default(""),
  /** Emitted only when the operator opts in; see docs/v3/SITE_BUILDER.md. */
  emitLlmsTxt: z.boolean().default(false),
  organizationName: optionalText(120),
  /** LocalBusiness structured data needs a real address to be truthful. */
  addressLocality: optionalText(120),
  addressCountry: optionalText(2),
});

export type SiteSeo = z.infer<typeof siteSeoSchema>;

/* ------------------------------------------------------------------------ */
/* Paths and contrast                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Site page paths.
 *
 * Reserved prefixes are refused because the generated Worker owns them:
 * `/_tripistic` is the health and metadata surface, and letting a page claim
 * it would let a tenant shadow the endpoint the deployment health check reads.
 */
const RESERVED_PATH_PREFIXES = ["/_tripistic", "/_next", "/api"];

export const sitePagePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .transform((value) => (value.startsWith("/") ? value : `/${value}`))
  .refine((value) => /^\/[a-z0-9\-/]*$/.test(value), {
    message: "Use lowercase letters, numbers, hyphens and slashes only.",
  })
  // Empty segments and trailing slashes are rejected so `/tours` and `/tours/`
  // cannot both exist as distinct pages — two URLs for one page is a
  // duplicate-content problem the operator cannot see and did not choose.
  .refine((value) => !value.includes("//"), { message: "Paths cannot contain empty segments." })
  .refine((value) => value === "/" || !value.endsWith("/"), {
    message: "Paths cannot end with a slash.",
  })
  .refine((value) => !RESERVED_PATH_PREFIXES.some((prefix) => value.startsWith(prefix)), {
    message: "This path is reserved by Tripistic.",
  });

/**
 * Site subdomains.
 *
 * This becomes a public hostname, so the rules are DNS's rules, not ours: 3–63
 * characters, lowercase alphanumerics and hyphens, no leading or trailing
 * hyphen. A short deny-list keeps operational names off the tenant apex.
 */
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "preview",
  "cdn",
  "assets",
  "mail",
  "status",
  "docs",
  "help",
  "support",
  "tripistic",
]);

export const siteSubdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers and hyphens.")
  .refine((value) => !RESERVED_SUBDOMAINS.has(value), {
    message: "This subdomain is reserved.",
  })
  // `xn--` is the punycode prefix. Accepting one here would let a tenant claim
  // a homograph of another operator's hostname.
  .refine((value) => !value.startsWith("xn--"), {
    message: "Internationalised subdomains are not supported yet.",
  });

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const raw = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Refuses a theme whose body text would be unreadable.
 *
 * Enforced at the schema, not as a warning in the editor. An AI-generated
 * theme is the likeliest source of a 2:1 palette, and a warning that publish
 * can ignore is how an inaccessible site reaches production.
 */
export function validateSiteTheme(input: unknown): SiteTheme {
  const theme = siteThemeSchema.parse(input);
  if (contrastRatio(theme.textColor, theme.backgroundColor) < 4.5) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["textColor"],
        message: "Text and background colours must meet WCAG AA contrast (4.5:1).",
      },
    ]);
  }
  return theme;
}

export function validatePageContent(input: unknown): PageContent {
  const content = pageContentSchema.parse(input);
  const seen = new Set<string>();
  for (const item of content.sections) {
    if (seen.has(item.id)) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["sections"],
          message: `Duplicate section id: ${item.id}`,
        },
      ]);
    }
    seen.add(item.id);
  }
  return content;
}

export function emptyPageContent(): PageContent {
  return { version: SITE_CONTENT_VERSION, sections: [] };
}
