import type { MetadataRoute } from "next";
import { featureList, solutions } from "@/lib/marketing/content";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tripistic.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/features",
    "/solutions",
    "/pricing",
    "/demo",
    "/why-tripistic",
    "/ai-platform",
    "/white-label",
    "/customer-portal",
    "/integrations",
    "/developers",
    "/docs",
    "/help",
    "/blog",
    "/changelog",
    "/roadmap",
    "/customers",
    "/partners",
    "/careers",
    "/about",
    "/contact",
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${baseUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: route === "" ? 1 : 0.8,
    })),
    ...featureList.map((feature) => ({
      url: `${baseUrl}/features/${feature.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...solutions.map((solution) => ({
      url: `${baseUrl}/solutions/${solution.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
