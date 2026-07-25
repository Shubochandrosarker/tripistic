import type { Metadata } from "next";

import { SITE, absoluteUrl } from "@/lib/seo/site";

export type PageSeo = {
  title: string;
  description: string;
  /** Site-relative path, used for the canonical URL and Open Graph URL. */
  path: string;
  /** Short eyebrow rendered on the generated Open Graph image. */
  eyebrow?: string;
  keywords?: string[];
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  /** Override the generated social image with a static asset. */
  image?: string;
  noIndex?: boolean;
};

/** URL for the dynamically generated Open Graph / Twitter card image. */
export function ogImageUrl({ title, eyebrow }: { title: string; eyebrow?: string }): string {
  const params = new URLSearchParams({ title });
  if (eyebrow) params.set("eyebrow", eyebrow);
  return absoluteUrl(`/og?${params.toString()}`);
}

/**
 * Single source of truth for page metadata: canonical URL, Open Graph,
 * Twitter card, robots directives, and the generated social image.
 */
export function buildMetadata({
  title,
  description,
  path,
  eyebrow,
  keywords,
  type = "website",
  publishedTime,
  modifiedTime,
  authors,
  image,
  noIndex = false,
}: PageSeo): Metadata {
  const canonical = absoluteUrl(path);
  const socialImage = image ? absoluteUrl(image) : ogImageUrl({ title, eyebrow });

  return {
    title,
    description,
    keywords: keywords && keywords.length > 0 ? keywords : undefined,
    alternates: { canonical },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
        },
    openGraph: {
      type,
      url: canonical,
      siteName: SITE.name,
      locale: SITE.locale,
      title,
      description,
      images: [{ url: socialImage, width: 1200, height: 630, alt: title }],
      ...(type === "article"
        ? { publishedTime, modifiedTime, authors: authors ?? [SITE.name] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      site: SITE.twitter,
      creator: SITE.twitter,
      title,
      description,
      images: [socialImage],
    },
  };
}
