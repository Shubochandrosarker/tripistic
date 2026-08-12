import type { SiteSection, SiteSectionType } from "@/lib/sites/schema";

/**
 * Editor metadata for the section library.
 *
 * `lib/sites/schema.ts` says what a section *is*; this says how a person edits
 * one. Keeping the two apart matters: the schema is a security boundary and
 * must stay readable as one, while this file is presentation and changes
 * whenever the editor's UX does.
 *
 * The field descriptors exist so the properties panel is written once rather
 * than thirty times. Thirty bespoke panels would drift — a `maxLength` here, a
 * missing alt-text field there — and every drift is a section whose editor
 * lets you save something the schema then rejects on publish, with the error
 * surfacing minutes later at the worst possible moment.
 *
 * The defaults are validated against the real Zod schema by a unit test. A
 * section that cannot be added without immediately failing validation is a
 * broken "Add section" button, and that test is the only thing that reliably
 * catches it.
 */

export type FieldDescriptor =
  | { kind: "text"; key: string; label: string; maxLength?: number; placeholder?: string; help?: string }
  | { kind: "textarea"; key: string; label: string; maxLength?: number; rows?: number; help?: string }
  | { kind: "number"; key: string; label: string; min?: number; max?: number; step?: number; help?: string }
  | { kind: "boolean"; key: string; label: string; help?: string }
  | { kind: "select"; key: string; label: string; options: Array<{ value: string; label: string }>; help?: string }
  | { kind: "url"; key: string; label: string; help?: string }
  | { kind: "link"; key: string; label: string; help?: string }
  | { kind: "image"; key: string; label: string; help?: string }
  | { kind: "cta"; key: string; label: string; help?: string }
  | { kind: "stringList"; key: string; label: string; itemLabel: string; help?: string }
  | { kind: "tourIds"; key: string; label: string; help?: string }
  | { kind: "tourId"; key: string; label: string; help?: string }
  | { kind: "breakpoints"; key: string; label: string; help?: string }
  | {
      kind: "repeater";
      key: string;
      label: string;
      itemLabel: string;
      fields: FieldDescriptor[];
      help?: string;
    };

export type SectionGroup = "structure" | "hero" | "tours" | "content" | "social" | "convert";

export type SectionDefinition = {
  type: SiteSectionType;
  label: string;
  description: string;
  group: SectionGroup;
  /** Sections the page shape depends on; the editor refuses to delete them. */
  structural?: boolean;
  fields: FieldDescriptor[];
  defaults: Record<string, unknown>;
};

export const SECTION_GROUPS: Array<{ id: SectionGroup; label: string }> = [
  { id: "structure", label: "Structure" },
  { id: "hero", label: "Headers & heroes" },
  { id: "tours", label: "Tours & booking" },
  { id: "content", label: "Content" },
  { id: "social", label: "Social proof" },
  { id: "convert", label: "Contact & convert" },
];

const CTA_FIELD = (key: string, label: string): FieldDescriptor => ({ kind: "cta", key, label });

const TITLE_FIELD: FieldDescriptor = { kind: "text", key: "title", label: "Title", maxLength: 120 };

const IMAGE_FIELDS: FieldDescriptor[] = [
  { kind: "url", key: "url", label: "Image URL" },
  {
    kind: "text",
    key: "alt",
    label: "Alt text",
    maxLength: 200,
    help: "Describe the image for someone who cannot see it. Leave empty only if it is purely decorative.",
  },
  { kind: "text", key: "caption", label: "Caption", maxLength: 200 },
];

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    type: "header",
    label: "Header",
    description: "Logo, navigation and the book button.",
    group: "structure",
    structural: true,
    fields: [
      { kind: "url", key: "logoUrl", label: "Logo URL" },
      { kind: "boolean", key: "showBookButton", label: "Show book button" },
      { kind: "boolean", key: "sticky", label: "Stick to the top on scroll" },
    ],
    defaults: { logoUrl: "", showBookButton: true, sticky: true },
  },
  {
    type: "footer",
    label: "Footer",
    description: "Tagline, link columns and social profiles.",
    group: "structure",
    structural: true,
    fields: [
      { kind: "text", key: "tagline", label: "Tagline", maxLength: 200 },
      {
        kind: "repeater",
        key: "columns",
        label: "Link columns",
        itemLabel: "Column",
        fields: [
          { kind: "text", key: "heading", label: "Heading", maxLength: 60 },
          {
            kind: "repeater",
            key: "links",
            label: "Links",
            itemLabel: "Link",
            fields: [
              { kind: "text", key: "label", label: "Label", maxLength: 60 },
              { kind: "link", key: "href", label: "Link" },
            ],
          },
        ],
      },
      {
        kind: "repeater",
        key: "socialLinks",
        label: "Social links",
        itemLabel: "Profile",
        fields: [
          { kind: "text", key: "platform", label: "Platform", maxLength: 40 },
          { kind: "url", key: "href", label: "URL" },
        ],
      },
      {
        kind: "boolean",
        key: "showAttribution",
        label: "Show “Powered by Tripistic”",
        help: "Removing this requires the white-label entitlement; it is re-checked at publish.",
      },
    ],
    defaults: { tagline: "", columns: [], socialLinks: [], showAttribution: true },
  },
  {
    type: "announcement",
    label: "Announcement bar",
    description: "A single dismissible line above everything else.",
    group: "structure",
    fields: [
      { kind: "text", key: "message", label: "Message", maxLength: 200 },
      CTA_FIELD("cta", "Call to action"),
      { kind: "boolean", key: "dismissible", label: "Visitors can dismiss it" },
    ],
    defaults: { message: "Now taking bookings for the new season.", dismissible: true },
  },
  {
    type: "hero",
    label: "Hero",
    description: "The first thing a visitor reads.",
    group: "hero",
    fields: [
      { kind: "text", key: "eyebrow", label: "Eyebrow", maxLength: 80 },
      { kind: "text", key: "title", label: "Headline", maxLength: 140 },
      { kind: "textarea", key: "subtitle", label: "Subheadline", maxLength: 400, rows: 3 },
      { kind: "image", key: "image", label: "Background image" },
      CTA_FIELD("primaryCta", "Primary button"),
      CTA_FIELD("secondaryCta", "Secondary button"),
      {
        kind: "number",
        key: "overlayOpacity",
        label: "Image overlay",
        min: 0,
        max: 1,
        step: 0.05,
        help: "Darkens the image behind the text. Raise it if the headline is hard to read.",
      },
    ],
    defaults: {
      eyebrow: "",
      title: "Small-group tours, run by people who live here",
      subtitle: "",
      overlayOpacity: 0.35,
    },
  },
  {
    type: "logoCloud",
    label: "Logo cloud",
    description: "Partner or press logos.",
    group: "social",
    fields: [
      TITLE_FIELD,
      { kind: "repeater", key: "logos", label: "Logos", itemLabel: "Logo", fields: IMAGE_FIELDS },
    ],
    defaults: { title: "", logos: [] },
  },
  {
    type: "trustBar",
    label: "Trust bar",
    description: "A row of short proof points.",
    group: "social",
    fields: [
      {
        kind: "repeater",
        key: "items",
        label: "Items",
        itemLabel: "Item",
        fields: [
          { kind: "text", key: "value", label: "Value", maxLength: 40 },
          { kind: "text", key: "label", label: "Label", maxLength: 60 },
          { kind: "text", key: "icon", label: "Icon name", maxLength: 40 },
        ],
      },
    ],
    defaults: { items: [{ value: "4.9", label: "Average rating", icon: "" }] },
  },
  {
    type: "tourCards",
    label: "Tour grid",
    description: "Cards for your live tours. Prices and availability stay in sync automatically.",
    group: "tours",
    fields: [
      TITLE_FIELD,
      { kind: "textarea", key: "subtitle", label: "Subtitle", maxLength: 300, rows: 2 },
      {
        kind: "tourIds",
        key: "tourIds",
        label: "Tours",
        help: "Leave empty and turn on auto-fill to always show your newest active tours.",
      },
      { kind: "boolean", key: "autoFill", label: "Fill from active tours when empty" },
      { kind: "number", key: "limit", label: "Maximum cards", min: 1, max: 24 },
      {
        kind: "select",
        key: "columns",
        label: "Columns",
        options: [
          { value: "2", label: "Two" },
          { value: "3", label: "Three" },
          { value: "4", label: "Four" },
        ],
      },
      { kind: "boolean", key: "showPrice", label: "Show price" },
      { kind: "boolean", key: "showDuration", label: "Show duration" },
    ],
    defaults: {
      title: "Our tours",
      subtitle: "",
      tourIds: [],
      autoFill: true,
      limit: 6,
      columns: 3,
      showPrice: true,
      showDuration: true,
    },
  },
  {
    type: "featuredTour",
    label: "Featured tour",
    description: "One tour, given the whole width.",
    group: "tours",
    fields: [
      { kind: "tourId", key: "tourId", label: "Tour" },
      { kind: "text", key: "headline", label: "Headline", maxLength: 140 },
      { kind: "textarea", key: "body", label: "Body", maxLength: 1200, rows: 4 },
      CTA_FIELD("cta", "Button"),
    ],
    defaults: { headline: "", body: "" },
  },
  {
    type: "bookingWidget",
    label: "Booking widget",
    description: "The Tripistic booking flow, inline or behind a button.",
    group: "tours",
    fields: [
      { kind: "tourId", key: "tourId", label: "Tour" },
      {
        kind: "select",
        key: "mode",
        label: "Display",
        options: [
          { value: "inline", label: "Inline" },
          { value: "modal", label: "Modal" },
          { value: "button", label: "Button only" },
        ],
      },
      { kind: "text", key: "buttonLabel", label: "Button label", maxLength: 40 },
      { kind: "boolean", key: "showAvailability", label: "Show upcoming departures" },
    ],
    defaults: { mode: "inline", buttonLabel: "Book now", showAvailability: true },
  },
  {
    type: "availabilityCalendar",
    label: "Availability calendar",
    description: "A month view of departures for one tour.",
    group: "tours",
    fields: [
      { kind: "tourId", key: "tourId", label: "Tour" },
      { kind: "number", key: "monthsVisible", label: "Months visible", min: 1, max: 3 },
    ],
    defaults: { monthsVisible: 1 },
  },
  {
    type: "destinationCards",
    label: "Destination cards",
    description: "Places you operate in.",
    group: "content",
    fields: [
      TITLE_FIELD,
      {
        kind: "repeater",
        key: "destinations",
        label: "Destinations",
        itemLabel: "Destination",
        fields: [
          { kind: "text", key: "name", label: "Name", maxLength: 80 },
          { kind: "textarea", key: "blurb", label: "Blurb", maxLength: 240, rows: 2 },
          { kind: "link", key: "href", label: "Link" },
          { kind: "image", key: "image", label: "Image" },
        ],
      },
    ],
    defaults: { title: "Where we go", destinations: [] },
  },
  {
    type: "categoryCards",
    label: "Category cards",
    description: "Ways to browse — by theme, length or audience.",
    group: "content",
    fields: [
      TITLE_FIELD,
      {
        kind: "repeater",
        key: "categories",
        label: "Categories",
        itemLabel: "Category",
        fields: [
          { kind: "text", key: "label", label: "Label", maxLength: 60 },
          { kind: "link", key: "href", label: "Link" },
          { kind: "image", key: "image", label: "Image" },
        ],
      },
    ],
    defaults: { title: "", categories: [] },
  },
  {
    type: "itinerary",
    label: "Itinerary",
    description: "A day-by-day breakdown.",
    group: "content",
    fields: [
      TITLE_FIELD,
      {
        kind: "repeater",
        key: "days",
        label: "Days",
        itemLabel: "Day",
        fields: [
          { kind: "text", key: "label", label: "Label", maxLength: 60 },
          { kind: "text", key: "title", label: "Title", maxLength: 140 },
          { kind: "textarea", key: "body", label: "Description", maxLength: 1500, rows: 4 },
          { kind: "image", key: "image", label: "Image" },
        ],
      },
    ],
    defaults: { title: "Your itinerary", days: [] },
  },
  {
    type: "highlights",
    label: "Highlights",
    description: "What makes this worth doing.",
    group: "content",
    fields: [TITLE_FIELD, { kind: "stringList", key: "items", label: "Highlights", itemLabel: "Highlight" }],
    defaults: { title: "Highlights", items: [] },
  },
  {
    type: "inclusions",
    label: "What's included",
    description: "Everything covered by the price.",
    group: "content",
    fields: [TITLE_FIELD, { kind: "stringList", key: "items", label: "Included", itemLabel: "Item" }],
    defaults: { title: "What's included", items: [] },
  },
  {
    type: "exclusions",
    label: "What's not included",
    description: "Set expectations before someone books.",
    group: "content",
    fields: [TITLE_FIELD, { kind: "stringList", key: "items", label: "Not included", itemLabel: "Item" }],
    defaults: { title: "What's not included", items: [] },
  },
  {
    type: "gallery",
    label: "Gallery",
    description: "Photographs from your tours.",
    group: "content",
    fields: [
      TITLE_FIELD,
      { kind: "repeater", key: "images", label: "Images", itemLabel: "Image", fields: IMAGE_FIELDS },
      {
        kind: "select",
        key: "layout",
        label: "Layout",
        options: [
          { value: "grid", label: "Grid" },
          { value: "masonry", label: "Masonry" },
          { value: "carousel", label: "Carousel" },
        ],
      },
    ],
    defaults: { title: "", images: [], layout: "grid" },
  },
  {
    type: "video",
    label: "Video",
    description: "An embedded video.",
    group: "content",
    fields: [
      TITLE_FIELD,
      { kind: "url", key: "embedUrl", label: "Embed URL" },
      { kind: "image", key: "poster", label: "Poster image" },
    ],
    defaults: { title: "", embedUrl: "" },
  },
  {
    type: "map",
    label: "Map",
    description: "Where you meet.",
    group: "content",
    fields: [
      TITLE_FIELD,
      { kind: "text", key: "address", label: "Address", maxLength: 240 },
      { kind: "number", key: "latitude", label: "Latitude", min: -90, max: 90, step: 0.000001 },
      { kind: "number", key: "longitude", label: "Longitude", min: -180, max: 180, step: 0.000001 },
      { kind: "number", key: "zoom", label: "Zoom", min: 1, max: 20 },
    ],
    defaults: { title: "Meeting point", address: "", zoom: 13 },
  },
  {
    type: "guideProfile",
    label: "Guide profile",
    description: "Who a guest will actually be spending the day with.",
    group: "social",
    fields: [
      { kind: "text", key: "name", label: "Name", maxLength: 120 },
      { kind: "text", key: "role", label: "Role", maxLength: 80 },
      { kind: "textarea", key: "bio", label: "Biography", maxLength: 1500, rows: 5 },
      { kind: "image", key: "photo", label: "Photo" },
      { kind: "stringList", key: "languages", label: "Languages", itemLabel: "Language" },
    ],
    defaults: { name: "Your name", role: "", bio: "", languages: [] },
  },
  {
    type: "about",
    label: "About",
    description: "The story behind the business.",
    group: "content",
    fields: [
      TITLE_FIELD,
      { kind: "textarea", key: "body", label: "Body", maxLength: 4000, rows: 8 },
      { kind: "image", key: "image", label: "Image" },
      CTA_FIELD("cta", "Button"),
    ],
    defaults: { title: "About us", body: "" },
  },
  {
    type: "reviews",
    label: "Reviews",
    description: "Ratings and comments from guests.",
    group: "social",
    fields: [
      TITLE_FIELD,
      {
        kind: "repeater",
        key: "reviews",
        label: "Reviews",
        itemLabel: "Review",
        fields: [
          { kind: "text", key: "author", label: "Author", maxLength: 80 },
          { kind: "number", key: "rating", label: "Rating", min: 1, max: 5, step: 0.5 },
          { kind: "textarea", key: "body", label: "Review", maxLength: 800, rows: 3 },
          { kind: "text", key: "date", label: "Date", maxLength: 40 },
          { kind: "text", key: "source", label: "Source", maxLength: 60 },
        ],
      },
    ],
    defaults: { title: "What guests say", reviews: [] },
  },
  {
    type: "testimonials",
    label: "Testimonials",
    description: "Longer quotes, without a star rating.",
    group: "social",
    fields: [
      TITLE_FIELD,
      {
        kind: "repeater",
        key: "quotes",
        label: "Quotes",
        itemLabel: "Quote",
        fields: [
          { kind: "textarea", key: "body", label: "Quote", maxLength: 600, rows: 3 },
          { kind: "text", key: "author", label: "Author", maxLength: 80 },
          { kind: "text", key: "role", label: "Role", maxLength: 80 },
        ],
      },
    ],
    defaults: { title: "", quotes: [] },
  },
  {
    type: "statistics",
    label: "Statistics",
    description: "A few numbers that make the business real.",
    group: "social",
    fields: [
      TITLE_FIELD,
      {
        kind: "repeater",
        key: "stats",
        label: "Statistics",
        itemLabel: "Statistic",
        fields: [
          { kind: "text", key: "value", label: "Value", maxLength: 24 },
          { kind: "text", key: "label", label: "Label", maxLength: 80 },
        ],
      },
    ],
    defaults: { title: "", stats: [] },
  },
  {
    type: "faq",
    label: "FAQ",
    description: "Questions guests ask before booking.",
    group: "content",
    fields: [
      TITLE_FIELD,
      {
        kind: "repeater",
        key: "items",
        label: "Questions",
        itemLabel: "Question",
        fields: [
          { kind: "text", key: "question", label: "Question", maxLength: 240 },
          { kind: "textarea", key: "answer", label: "Answer", maxLength: 2000, rows: 4 },
        ],
      },
      {
        kind: "boolean",
        key: "emitStructuredData",
        label: "Publish as FAQ rich results",
        help: "Only turn this on for genuine questions and answers. Marking up other content as an FAQ is search spam and can cost you the rich result entirely.",
      },
    ],
    defaults: { title: "Frequently asked questions", items: [], emitStructuredData: false },
  },
  {
    type: "policies",
    label: "Policies",
    description: "Cancellation, weather, accessibility.",
    group: "content",
    fields: [
      TITLE_FIELD,
      {
        kind: "repeater",
        key: "policies",
        label: "Policies",
        itemLabel: "Policy",
        fields: [
          { kind: "text", key: "heading", label: "Heading", maxLength: 120 },
          { kind: "textarea", key: "body", label: "Body", maxLength: 4000, rows: 5 },
        ],
      },
    ],
    defaults: { title: "Good to know", policies: [] },
  },
  {
    type: "cta",
    label: "Call to action",
    description: "A prompt to book or get in touch.",
    group: "convert",
    fields: [
      { kind: "text", key: "title", label: "Title", maxLength: 140 },
      { kind: "textarea", key: "body", label: "Body", maxLength: 400, rows: 2 },
      CTA_FIELD("primaryCta", "Primary button"),
      CTA_FIELD("secondaryCta", "Secondary button"),
    ],
    defaults: { title: "Ready when you are", body: "" },
  },
  {
    type: "contactForm",
    label: "Contact form",
    description: "Enquiries land in your Tripistic leads.",
    group: "convert",
    fields: [
      TITLE_FIELD,
      { kind: "textarea", key: "body", label: "Intro", maxLength: 400, rows: 2 },
      { kind: "boolean", key: "collectPhone", label: "Ask for a phone number" },
      { kind: "textarea", key: "consentText", label: "Consent text", maxLength: 400, rows: 2 },
    ],
    defaults: { title: "Get in touch", body: "", collectPhone: false, consentText: "" },
  },
  {
    type: "newsletter",
    label: "Newsletter",
    description: "Collect email addresses for a mailing list.",
    group: "convert",
    fields: [
      TITLE_FIELD,
      { kind: "textarea", key: "body", label: "Body", maxLength: 300, rows: 2 },
      { kind: "text", key: "buttonLabel", label: "Button label", maxLength: 40 },
    ],
    defaults: { title: "", body: "", buttonLabel: "Subscribe" },
  },
  {
    type: "contactCta",
    label: "Direct contact",
    description: "A WhatsApp, email or phone button.",
    group: "convert",
    fields: [
      {
        kind: "select",
        key: "channel",
        label: "Channel",
        options: [
          { value: "whatsapp", label: "WhatsApp" },
          { value: "email", label: "Email" },
          { value: "phone", label: "Phone" },
        ],
      },
      {
        kind: "text",
        key: "value",
        label: "Handle, address or number",
        maxLength: 120,
        help: "Enter the raw value. The link scheme is built for you, so a typo cannot become an arbitrary URL.",
      },
      { kind: "text", key: "label", label: "Button label", maxLength: 60 },
    ],
    defaults: { channel: "email", value: "hello@example.com", label: "" },
  },
];

const BY_TYPE = new Map(SECTION_DEFINITIONS.map((definition) => [definition.type, definition]));

export function sectionDefinition(type: SiteSectionType): SectionDefinition | undefined {
  return BY_TYPE.get(type);
}

export function sectionLabel(type: SiteSectionType): string {
  return BY_TYPE.get(type)?.label ?? type;
}

/** Shared layout controls, rendered under every section's own fields. */
export const LAYOUT_FIELDS: FieldDescriptor[] = [
  {
    kind: "select",
    key: "width",
    label: "Width",
    options: [
      { value: "narrow", label: "Narrow" },
      { value: "content", label: "Content" },
      { value: "wide", label: "Wide" },
      { value: "full", label: "Full bleed" },
    ],
  },
  {
    kind: "select",
    key: "align",
    label: "Alignment",
    options: [
      { value: "left", label: "Left" },
      { value: "center", label: "Centre" },
      { value: "right", label: "Right" },
    ],
  },
  {
    kind: "select",
    key: "background",
    label: "Background",
    options: [
      { value: "surface", label: "Surface" },
      { value: "muted", label: "Muted" },
      { value: "brand", label: "Brand" },
      { value: "dark", label: "Dark" },
      { value: "image", label: "Image" },
    ],
  },
  { kind: "url", key: "backgroundImage", label: "Background image URL" },
  {
    kind: "breakpoints",
    key: "visibleOn",
    label: "Visible on",
    help: "At least one breakpoint must stay selected. To hide a section everywhere, use the eye icon in the section list instead.",
  },
  {
    kind: "select",
    key: "paddingTop",
    label: "Space above",
    options: ["none", "sm", "md", "lg", "xl"].map((value) => ({ value, label: value })),
  },
  {
    kind: "select",
    key: "paddingBottom",
    label: "Space below",
    options: ["none", "sm", "md", "lg", "xl"].map((value) => ({ value, label: value })),
  },
];

/** A short, stable id for a new section. */
export function newSectionId(type: string): string {
  // Not `crypto.randomUUID()`: the id is capped at 64 characters and appears in
  // generated markup as a slot token, so something short and readable makes a
  // rendered page inspectable in devtools.
  return `${type}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A ready-to-insert section. Validated against the Zod schema by a test. */
export function createSection(type: SiteSectionType): SiteSection {
  const definition = BY_TYPE.get(type);
  if (!definition) throw new Error(`Unknown section type: ${type}`);
  return {
    id: newSectionId(type),
    type,
    layout: {
      paddingTop: "lg",
      paddingBottom: "lg",
      width: "content",
      align: "left",
      background: "surface",
      backgroundImage: "",
      visibleOn: ["desktop", "tablet", "mobile"],
    },
    props: { ...definition.defaults },
  } as SiteSection;
}
