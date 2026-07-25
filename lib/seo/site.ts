export const SITE = {
  name: "Tripistic",
  legalName: "Tripistic",
  tagline: "The AI Operating System for Tour Operators",
  description:
    "Tripistic is the AI-native travel operations platform for tour operators, agencies, and DMCs — bookings, CRM, operations, payments, AI itineraries, and white label in one system.",
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
