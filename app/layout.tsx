import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AnalyticsProvider } from "@/components/analytics/analytics-provider";
import { CookieConsent } from "@/components/analytics/cookie-consent";
import { JsonLd } from "@/components/marketing/json-ld";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeScript } from "@/components/theme/theme-script";
import { organizationSchema, softwareApplicationSchema, websiteSchema } from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Tripistic — tour operations platform",
    template: "%s · Tripistic",
  },
  description:
    "Tripistic helps independent tour operators manage bookings, payments, guides, waivers, guest communication, and growth insights from one dashboard — with 0% commission on direct bookings.",
  applicationName: SITE.name,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.name,
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: SITE.locale,
    images: ["/marketing/tripistic-hero-ops.png"],
  },
  twitter: {
    card: "summary_large_image",
    site: SITE.twitter,
    images: ["/marketing/tripistic-hero-ops.png"],
  },
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        {/*
          Last line of defence for reveal animations. Every AnimatedReveal
          renders at `opacity: 0` and is brought in by Framer Motion, so a
          visitor with JavaScript disabled — or one whose hydration fails —
          would otherwise see a page of invisible content. The `immediate`
          prop fixes the ordinary case; this covers the case where no script
          runs at all.
        */}
        <noscript>
          <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
        {/* Site-wide structured data; page-level schema is added per route. */}
        <JsonLd schema={[organizationSchema(), websiteSchema(), softwareApplicationSchema()]} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
        <CookieConsent />
        <AnalyticsProvider />
      </body>
    </html>
  );
}
