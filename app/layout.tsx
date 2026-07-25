import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeScript } from "@/components/theme/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://tripistic.com"),
  title: {
    default: "Tripistic — AI-native tour operations platform",
    template: "%s · Tripistic",
  },
  description:
    "Tripistic helps independent tour operators manage bookings, payments, guides, waivers, guest communication, and growth insights from one AI-powered dashboard — with 0% commission on direct bookings.",
  openGraph: {
    type: "website",
    siteName: "Tripistic",
    images: ["/marketing/tripistic-hero-ops.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/marketing/tripistic-hero-ops.png"],
  },
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
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
