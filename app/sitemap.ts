import type { MetadataRoute } from "next";

import { categorySlug, listCategories, listContent } from "@/lib/content";
import { featureList, solutions } from "@/lib/marketing/content";
import { absoluteUrl } from "@/lib/seo/site";

export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

function entry(
  path: string,
  priority: number,
  changeFrequency: Entry["changeFrequency"],
  lastModified: Date = new Date(),
): Entry {
  return { url: absoluteUrl(path), lastModified, changeFrequency, priority };
}

function contentDate(value: string): Date {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date() : new Date(parsed);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const primary: [string, number][] = [
    ["/", 1],
    ["/features", 0.9],
    ["/solutions", 0.9],
    ["/pricing", 0.9],
    ["/demo", 0.8],
    ["/why-tripistic", 0.8],
    ["/ai-platform", 0.8],
    ["/white-label", 0.8],
    ["/customer-portal", 0.8],
    ["/integrations", 0.8],
  ];

  const secondary: [string, number][] = [
    ["/developers", 0.7],
    ["/docs", 0.7],
    ["/help", 0.7],
    ["/blog", 0.7],
    ["/changelog", 0.6],
    ["/roadmap", 0.6],
    ["/customers", 0.7],
    ["/partners", 0.6],
    ["/careers", 0.6],
    ["/about", 0.6],
    ["/contact", 0.7],
    ["/legal", 0.5],
  ];

  return [
    ...primary.map(([path, priority]) => entry(path, priority, "weekly")),
    ...secondary.map(([path, priority]) => entry(path, priority, "weekly")),

    ...featureList.map((feature) => entry(`/features/${feature.slug}`, 0.75, "monthly")),
    ...solutions.map((solution) => entry(`/solutions/${solution.slug}`, 0.75, "monthly")),

    ...listContent("blog").map((post) =>
      entry(`/blog/${post.slug}`, 0.65, "monthly", contentDate(post.updatedAt || post.publishedAt)),
    ),
    ...listCategories("blog").map((category) =>
      entry(`/blog/category/${categorySlug(category)}`, 0.55, "weekly"),
    ),

    ...listContent("docs").map((doc) =>
      entry(`/docs/${doc.slug}`, 0.7, "monthly", contentDate(doc.updatedAt || doc.publishedAt)),
    ),
    ...listContent("help").map((doc) =>
      entry(`/help/${doc.slug}`, 0.6, "monthly", contentDate(doc.updatedAt || doc.publishedAt)),
    ),
    ...listContent("developers").map((doc) =>
      entry(
        `/developers/${doc.slug}`,
        0.7,
        "monthly",
        contentDate(doc.updatedAt || doc.publishedAt),
      ),
    ),
    ...listContent("legal").map((doc) =>
      entry(`/legal/${doc.slug}`, 0.45, "yearly", contentDate(doc.updatedAt || doc.publishedAt)),
    ),
  ];
}
