export const SITE = {
  name: "Tripistic",
  legalName: "Tripistic",
  tagline: "The Operating System for Tour Operators",
  // Phase 10 repositioning. This string is the meta description on every page
  // and the copy in every social card, so it was the single highest-reach
  // claim in the product — and it advertised "AI-native" and "AI itineraries",
  // neither of which exists: there is no LLM integration anywhere in this
  // codebase. Insights are computed by a documented rule engine
  // (lib/analytics/business-brain.ts), which is worth describing accurately
  // rather than dressing up.
  description:
    "Tripistic is the travel operations platform for tour operators, agencies, and DMCs — bookings, CRM, operations, payments, itineraries, and white label in one system.",
  url: (process.env.NEXT_PUBLIC_APP_URL ?? "https://tripistic.com").replace(/\/$/, ""),
  locale: "en_US",
  twitter: "@tripistic",
  supportEmail: "support@tripistic.com",
  salesEmail: "sales@tripistic.com",
  privacyEmail: "privacy@tripistic.com",
  securityEmail: "security@tripistic.com",
  legalEmail: "legal@tripistic.com",
  foundingYear: 2024,
  version: "2.0.0",
  social: [
    { label: "LinkedIn", href: "https://www.linkedin.com/company/tripistic" },
    { label: "X", href: "https://x.com/tripistic" },
    { label: "YouTube", href: "https://www.youtube.com/@tripistic" },
    { label: "GitHub", href: "https://github.com/tripistic" },
  ],
} as const;

export function absoluteUrl(pathname = "/"): string {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${SITE.url}${normalized === "/" ? "" : normalized}`;
}
