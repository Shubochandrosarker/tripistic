import fs from "node:fs";
import path from "node:path";

import {
  parseFrontmatter,
  readBoolean,
  readList,
  readNumber,
  readString,
} from "@/lib/content/frontmatter";
import { readingTimeMinutes, toPlainText } from "@/lib/content/markdown";

/**
 * File-backed content layer for the public marketing site.
 *
 * Content lives in `/content/<collection>/*.md` with frontmatter. The
 * `ContentSource` interface below is the seam a headless CMS would implement:
 * swap `fileContentSource` for an API-backed source and every marketing page
 * keeps working unchanged.
 */

export type ContentCollection = "legal" | "blog" | "docs" | "help" | "developers";

export type ContentDoc = {
  collection: ContentCollection;
  slug: string;
  title: string;
  description: string;
  /** Short label rendered above the title. */
  eyebrow: string;
  category: string;
  tags: string[];
  author: string;
  authorRole: string;
  /** ISO date. Content with a future date is treated as scheduled. */
  publishedAt: string;
  updatedAt: string;
  order: number;
  featured: boolean;
  draft: boolean;
  icon: string;
  body: string;
  excerpt: string;
  readingTime: number;
};

export type ContentSource = {
  list(collection: ContentCollection, options?: ListOptions): ContentDoc[];
  get(collection: ContentCollection, slug: string, options?: ListOptions): ContentDoc | null;
};

export type ListOptions = {
  /** Include drafts and future-dated documents. Used by the preview routes only. */
  includeUnpublished?: boolean;
};

const CONTENT_ROOT = path.join(process.cwd(), "content");

function collectionDir(collection: ContentCollection): string {
  return path.join(CONTENT_ROOT, collection);
}

function isPublished(doc: ContentDoc, now: number): boolean {
  if (doc.draft) return false;
  if (!doc.publishedAt) return true;
  const timestamp = Date.parse(doc.publishedAt);
  if (Number.isNaN(timestamp)) return true;
  return timestamp <= now;
}

function toDoc(collection: ContentCollection, fileName: string, raw: string): ContentDoc {
  const { data, body } = parseFrontmatter(raw);
  const slug = readString(data, "slug") || fileName.replace(/\.mdx?$/, "");

  return {
    collection,
    slug,
    title: readString(data, "title", slug),
    description: readString(data, "description") || toPlainText(body, 160),
    eyebrow: readString(data, "eyebrow"),
    category: readString(data, "category", "General"),
    tags: readList(data, "tags"),
    author: readString(data, "author", "Tripistic Team"),
    authorRole: readString(data, "authorRole", "Tripistic"),
    publishedAt: readString(data, "publishedAt"),
    updatedAt: readString(data, "updatedAt") || readString(data, "publishedAt"),
    order: readNumber(data, "order", 999),
    featured: readBoolean(data, "featured"),
    draft: readBoolean(data, "draft"),
    icon: readString(data, "icon"),
    body,
    excerpt: readString(data, "excerpt") || toPlainText(body, 190),
    readingTime: readingTimeMinutes(body),
  };
}

function readCollection(collection: ContentCollection): ContentDoc[] {
  const dir = collectionDir(collection);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .map((file) => toDoc(collection, file, fs.readFileSync(path.join(dir, file), "utf8")));
}

function sortDocs(collection: ContentCollection, docs: ContentDoc[]): ContentDoc[] {
  if (collection === "blog") {
    return [...docs].sort((a, b) => Date.parse(b.publishedAt || "0") - Date.parse(a.publishedAt || "0"));
  }
  return [...docs].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export const fileContentSource: ContentSource = {
  list(collection, options) {
    const now = Date.now();
    const docs = readCollection(collection).filter(
      (doc) => options?.includeUnpublished || isPublished(doc, now),
    );
    return sortDocs(collection, docs);
  },
  get(collection, slug, options) {
    return this.list(collection, options).find((doc) => doc.slug === slug) ?? null;
  },
};

/** Single seam for swapping in a headless CMS source. */
export function getContentSource(): ContentSource {
  return fileContentSource;
}

export function listContent(collection: ContentCollection, options?: ListOptions): ContentDoc[] {
  return getContentSource().list(collection, options);
}

export function getContent(
  collection: ContentCollection,
  slug: string,
  options?: ListOptions,
): ContentDoc | null {
  return getContentSource().get(collection, slug, options);
}

export function listCategories(collection: ContentCollection): string[] {
  const seen = new Set<string>();
  for (const doc of listContent(collection)) seen.add(doc.category);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function categorySlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function findCategoryBySlug(collection: ContentCollection, slug: string): string | null {
  return listCategories(collection).find((category) => categorySlug(category) === slug) ?? null;
}

/** Related documents: same category first, then the rest of the collection. */
export function relatedContent(doc: ContentDoc, limit = 3): ContentDoc[] {
  const all = listContent(doc.collection).filter((item) => item.slug !== doc.slug);
  const sameCategory = all.filter((item) => item.category === doc.category);
  const others = all.filter((item) => item.category !== doc.category);
  return [...sameCategory, ...others].slice(0, limit);
}

export function formatContentDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
