import type { BusinessType } from "@prisma/client";

import {
  SITE_CONTENT_VERSION,
  type PageContent,
  type SiteNavigation,
  type SiteSection,
  type SiteTheme,
} from "@/lib/sites/schema";

/**
 * Starting points for a generated travel website.
 *
 * These are not "themes" — the theme is a separate, orthogonal set of brand
 * tokens. A template decides *which sections a page has and in what order*,
 * which is the part an operator cannot usefully invent from a blank canvas.
 *
 * There is deliberately no single default layout. A walking-tour guide selling
 * one €25 experience and a DMC selling multi-day itineraries need genuinely
 * different pages, and the brief is explicit that one industry layout must not
 * be hard-coded. What they share is the section vocabulary, not the
 * composition.
 *
 * Copy here is placeholder prose the operator or the AI generator replaces. It
 * is written to be obviously placeholder rather than plausibly final, so an
 * operator who publishes without editing has an embarrassing page rather than
 * a page that quietly claims things about their business that are not true.
 */

export type SiteTemplateKey =
  | "independent_guide"
  | "walking_tours"
  | "adventure_operator"
  | "food_and_culture"
  | "day_trips_and_transfers"
  | "multi_day_operator"
  | "destination_management";

export type SiteTemplate = {
  key: SiteTemplateKey;
  name: string;
  description: string;
  /** Business types this template is offered first for. */
  suitedTo: BusinessType[];
  theme: Partial<SiteTheme>;
  navigation: SiteNavigation;
  pages: Array<{
    path: string;
    title: string;
    systemKey?: string;
    enabled: boolean;
    sections: SiteSection[];
  }>;
};

let sectionCounter = 0;

/**
 * Section ids only have to be unique within a page, and the editor rewrites
 * them on duplicate. A monotonic counter with a prefix is enough and, unlike
 * `crypto.randomUUID()`, keeps template output stable enough to diff in a test.
 */
function nextId(type: string): string {
  sectionCounter += 1;
  return `${type}-${sectionCounter}`;
}

function build<T extends SiteSection["type"]>(
  type: T,
  props: Record<string, unknown>,
  layout: Record<string, unknown> = {},
): SiteSection {
  return { id: nextId(type), type, layout, props } as unknown as SiteSection;
}

function header(): SiteSection {
  return build("header", { showBookButton: true, sticky: true }, { paddingTop: "none", paddingBottom: "none" });
}

function footer(): SiteSection {
  return build(
    "footer",
    {
      tagline: "",
      showAttribution: true,
      columns: [
        {
          heading: "Explore",
          links: [
            { label: "Tours", href: "/tours" },
            { label: "About", href: "/about" },
            { label: "Contact", href: "/contact" },
          ],
        },
        {
          heading: "Booking",
          links: [
            { label: "Terms", href: "/terms" },
            { label: "Privacy", href: "/privacy" },
            { label: "Cancellation policy", href: "/cancellation-policy" },
          ],
        },
      ],
    },
    { background: "dark", paddingTop: "lg", paddingBottom: "lg" },
  );
}

function legalPage(path: string, title: string) {
  return {
    path,
    title,
    enabled: true,
    sections: [
      header(),
      build(
        "policies",
        { title, policies: [{ heading: title, body: `Add your ${title.toLowerCase()} here.` }] },
        { width: "narrow" },
      ),
      footer(),
    ],
  };
}

/** Pages every template gets, so no generated site ships without them. */
function commonPages() {
  return [
    {
      path: "/contact",
      title: "Contact",
      enabled: true,
      sections: [
        header(),
        build("contactForm", {
          title: "Get in touch",
          body: "Questions about a tour, a private booking or a group? Send us a message.",
          collectPhone: true,
        }),
        footer(),
      ],
    },
    legalPage("/terms", "Terms"),
    legalPage("/privacy", "Privacy policy"),
    legalPage("/cancellation-policy", "Cancellation policy"),
  ];
}

const defaultNavigation: SiteNavigation = {
  primary: [
    { label: "Tours", href: "/tours" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  footer: [
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
  ],
};

function toursPage(title: string, subtitle: string) {
  return {
    path: "/tours",
    title,
    systemKey: "tours",
    enabled: true,
    sections: [
      header(),
      build("tourCards", {
        title,
        subtitle,
        autoFill: true,
        limit: 24,
        columns: 3,
        showPrice: true,
        showDuration: true,
      }),
      footer(),
    ],
  };
}

function aboutPage(title: string, body: string) {
  return {
    path: "/about",
    title: "About",
    enabled: true,
    sections: [
      header(),
      build("about", { title, body }, { width: "narrow" }),
      build("statistics", { stats: [] }),
      footer(),
    ],
  };
}

export const SITE_TEMPLATES: readonly SiteTemplate[] = [
  {
    key: "independent_guide",
    name: "Independent guide",
    description: "A personal, photography-led site for one guide selling their own experiences.",
    suitedTo: ["solo_guide"],
    theme: { headingFont: "editorial", buttonRadius: "pill", primaryColor: "#0f766e" },
    navigation: defaultNavigation,
    pages: [
      {
        path: "/",
        title: "Home",
        systemKey: "home",
        enabled: true,
        sections: [
          header(),
          build(
            "hero",
            {
              eyebrow: "Local guide",
              title: "Add your headline here",
              subtitle: "One sentence on who you guide and where.",
              overlayOpacity: 0.35,
              primaryCta: { label: "See tours", href: "/tours", style: "primary" },
            },
            { background: "image", paddingTop: "xl", paddingBottom: "xl", align: "center" },
          ),
          build("tourCards", { title: "Experiences", autoFill: true, limit: 6, columns: 3 }),
          build("guideProfile", { name: "Your name", role: "Guide", bio: "", languages: [] }),
          build("reviews", { title: "What travellers say", reviews: [] }),
          build("faq", { title: "Before you book", items: [] }),
          build("cta", { title: "Ready to explore?", primaryCta: { label: "Book a tour", href: "/tours", style: "primary" } }, { background: "brand", align: "center" }),
          footer(),
        ],
      },
      toursPage("Tours", "Pick a date and book directly."),
      aboutPage("About me", "Tell travellers who you are and why you guide."),
      ...commonPages(),
    ],
  },
  {
    key: "walking_tours",
    name: "Walking and city tours",
    description: "Schedule-forward layout for daily departures in one city.",
    suitedTo: ["solo_guide", "small_operator"],
    theme: { headingFont: "grotesk", cardRadius: "sm", primaryColor: "#1d4ed8" },
    navigation: defaultNavigation,
    pages: [
      {
        path: "/",
        title: "Home",
        systemKey: "home",
        enabled: true,
        sections: [
          header(),
          build("announcement", { message: "Daily departures — add your announcement here.", dismissible: true }, { paddingTop: "none", paddingBottom: "none" }),
          build("hero", { title: "Add your headline here", subtitle: "", primaryCta: { label: "Check availability", href: "/tours", style: "primary" } }, { background: "image", align: "center" }),
          build("trustBar", { items: [] }),
          build("tourCards", { title: "Today's walks", autoFill: true, limit: 6, columns: 3 }),
          build("map", { title: "Where we meet", zoom: 14 }),
          build("faq", { title: "Good to know", items: [] }),
          footer(),
        ],
      },
      toursPage("All walks", "Every departure, with live availability."),
      aboutPage("About us", "Tell travellers about your team and your city."),
      ...commonPages(),
    ],
  },
  {
    key: "adventure_operator",
    name: "Adventure operator",
    description: "Difficulty, inclusions and safety information up front.",
    suitedTo: ["small_operator", "rental_activity_business"],
    theme: { mode: "dark", primaryColor: "#ea580c", headingFont: "grotesk" },
    navigation: defaultNavigation,
    pages: [
      {
        path: "/",
        title: "Home",
        systemKey: "home",
        enabled: true,
        sections: [
          header(),
          build("hero", { title: "Add your headline here", subtitle: "", overlayOpacity: 0.5 }, { background: "image", paddingTop: "xl", paddingBottom: "xl" }),
          build("categoryCards", { title: "Choose your adventure", categories: [] }),
          build("tourCards", { title: "Featured trips", autoFill: true, limit: 6, columns: 3 }),
          build("highlights", { title: "Why book with us", items: [] }),
          build("inclusions", { title: "What's included", items: [] }),
          build("gallery", { title: "From recent trips", images: [], layout: "grid" }),
          build("cta", { title: "Questions before you book?", primaryCta: { label: "Contact us", href: "/contact", style: "primary" } }, { background: "brand" }),
          footer(),
        ],
      },
      toursPage("Trips", "Browse by activity and difficulty."),
      aboutPage("About", "Your safety record, guides and certifications."),
      ...commonPages(),
    ],
  },
  {
    key: "food_and_culture",
    name: "Food and cultural tours",
    description: "Editorial layout built around imagery and storytelling.",
    suitedTo: ["small_operator", "solo_guide"],
    theme: { headingFont: "editorial", bodyFont: "serif", primaryColor: "#b45309" },
    navigation: defaultNavigation,
    pages: [
      {
        path: "/",
        title: "Home",
        systemKey: "home",
        enabled: true,
        sections: [
          header(),
          build("hero", { title: "Add your headline here", subtitle: "" }, { background: "image", align: "center" }),
          build("about", { title: "Our story", body: "" }, { width: "narrow" }),
          build("featuredTour", { headline: "This month's table", body: "" }),
          build("tourCards", { title: "Tastings and tours", autoFill: true, limit: 6, columns: 2 }),
          build("gallery", { title: "On the tour", images: [], layout: "masonry" }),
          build("testimonials", { title: "Guest notes", quotes: [] }),
          footer(),
        ],
      },
      toursPage("Tours", "Small groups, seasonal menus."),
      aboutPage("Our story", "Who cooks, who guides, and why."),
      ...commonPages(),
    ],
  },
  {
    key: "day_trips_and_transfers",
    name: "Day trips and transfers",
    description: "Route-led layout for excursions, shuttles and airport transfers.",
    suitedTo: ["rental_activity_business", "small_operator"],
    theme: { primaryColor: "#0891b2", cardRadius: "sm", buttonRadius: "sm" },
    navigation: defaultNavigation,
    pages: [
      {
        path: "/",
        title: "Home",
        systemKey: "home",
        enabled: true,
        sections: [
          header(),
          build("hero", { title: "Add your headline here", subtitle: "", primaryCta: { label: "Check prices", href: "/tours", style: "primary" } }, { background: "brand" }),
          build("destinationCards", { title: "Popular routes", destinations: [] }),
          build("tourCards", { title: "Scheduled departures", autoFill: true, limit: 8, columns: 4 }),
          build("trustBar", { items: [] }),
          build("faq", { title: "Booking and pickup", items: [] }),
          build("contactCta", { channel: "whatsapp", value: "", label: "Message us" }),
          footer(),
        ],
      },
      toursPage("Routes and transfers", "Fixed prices, live availability."),
      aboutPage("About", "Your fleet, drivers and coverage area."),
      ...commonPages(),
    ],
  },
  {
    key: "multi_day_operator",
    name: "Multi-day tours",
    description: "Itinerary-first layout for trips measured in days, not hours.",
    suitedTo: ["multi_day_tour_operator", "multi_guide_operator"],
    theme: { headingFont: "editorial", primaryColor: "#155e75" },
    navigation: {
      primary: [
        { label: "Trips", href: "/tours" },
        { label: "Destinations", href: "/destinations" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
      footer: defaultNavigation.footer,
    },
    pages: [
      {
        path: "/",
        title: "Home",
        systemKey: "home",
        enabled: true,
        sections: [
          header(),
          build("hero", { title: "Add your headline here", subtitle: "" }, { background: "image", paddingTop: "xl", paddingBottom: "xl" }),
          build("destinationCards", { title: "Where we travel", destinations: [] }),
          build("featuredTour", { headline: "Signature journey", body: "" }),
          build("itinerary", { title: "A day on the road", days: [] }),
          build("inclusions", { title: "Included", items: [] }),
          build("exclusions", { title: "Not included", items: [] }),
          build("reviews", { title: "Traveller reviews", reviews: [] }),
          footer(),
        ],
      },
      toursPage("Trips", "Multi-day journeys with full itineraries."),
      {
        path: "/destinations",
        title: "Destinations",
        enabled: true,
        sections: [header(), build("destinationCards", { title: "Destinations", destinations: [] }), footer()],
      },
      aboutPage("About", "Your company, your guides, your operating standards."),
      ...commonPages(),
    ],
  },
  {
    key: "destination_management",
    name: "Destination management company",
    description: "B2B-leaning layout for DMCs and agencies selling bespoke programmes.",
    suitedTo: ["agency", "multi_guide_operator"],
    theme: { primaryColor: "#334155", headingFont: "grotesk", cardRadius: "none" },
    navigation: defaultNavigation,
    pages: [
      {
        path: "/",
        title: "Home",
        systemKey: "home",
        enabled: true,
        sections: [
          header(),
          build("hero", { title: "Add your headline here", subtitle: "" }, { background: "dark", align: "left" }),
          build("statistics", { stats: [] }),
          build("logoCloud", { title: "Trusted by", logos: [] }),
          build("categoryCards", { title: "What we deliver", categories: [] }),
          build("about", { title: "How we work", body: "" }, { width: "narrow" }),
          build("cta", { title: "Request a proposal", primaryCta: { label: "Get in touch", href: "/contact", style: "primary" } }, { background: "brand" }),
          footer(),
        ],
      },
      toursPage("Programmes", "Sample programmes and departures."),
      aboutPage("About", "Your local presence, licences and partners."),
      ...commonPages(),
    ],
  },
] as const;

export function findSiteTemplate(key: string): SiteTemplate | undefined {
  return SITE_TEMPLATES.find((template) => template.key === key);
}

/** Templates ordered so the ones matching the workspace's business type lead. */
export function templatesForBusinessType(businessType: BusinessType): SiteTemplate[] {
  const suited = SITE_TEMPLATES.filter((template) => template.suitedTo.includes(businessType));
  const rest = SITE_TEMPLATES.filter((template) => !template.suitedTo.includes(businessType));
  return [...suited, ...rest];
}

export function templatePageContent(sections: SiteSection[]): PageContent {
  return { version: SITE_CONTENT_VERSION, sections };
}
