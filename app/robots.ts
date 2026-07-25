import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo/site";

/**
 * Authenticated surfaces, API routes, and guest-token URLs are kept out of the
 * index. `/og` is excluded because generated social cards are not pages.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/dashboard",
    "/admin",
    "/api",
    "/og",
    "/book/confirmation",
    "/itinerary/",
    "/invite/",
    "/unsubscribe/",
    "/workspaces/",
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Explicit allowance so AI crawlers can read the site map we publish for them.
      { userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"], allow: ["/", "/llms.txt"], disallow },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
