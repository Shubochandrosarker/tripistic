/**
 * Media library for marketing content.
 *
 * Content authors reference media by `id` instead of hardcoding paths, so
 * assets can be re-pointed at a CDN or headless CMS without touching copy.
 * Every entry carries alt text — required for WCAG 2.2 AA compliance.
 */

export type MediaAsset = {
  id: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  category: "product" | "brand" | "illustration";
  caption?: string;
};

export const mediaLibrary: MediaAsset[] = [
  {
    id: "hero-ops",
    src: "/marketing/tripistic-hero-ops.png",
    alt: "Tripistic operations command center showing departures, guides, and revenue for the day",
    width: 1920,
    height: 1080,
    category: "product",
    caption: "The operations command center on a live trip day.",
  },
];

export function getMedia(id: string): MediaAsset | null {
  return mediaLibrary.find((asset) => asset.id === id) ?? null;
}
