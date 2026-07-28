import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color.");
const optionalUrl = z.preprocess(
  (value) => (value === null ? "" : value),
  z.string().url().max(500).or(z.literal("")).transform((value) => value || null),
);
const optionalEmail = z.preprocess(
  (value) => (value === null ? "" : value),
  z.string().email().or(z.literal("")).transform((value) => value || null),
);
const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

const pageSectionSchema = z.object({
  enabled: z.boolean().default(true),
  title: optionalText(120),
  body: optionalText(2000),
});

export const storefrontDraftSchema = z.object({
  brand: z.object({
    brandName: z.string().trim().min(2).max(120),
    logoUrl: optionalUrl.default(""),
    faviconUrl: optionalUrl.default(""),
    primaryColor: hexColor.default("#0f766e"),
    secondaryColor: hexColor.default("#0f172a"),
    accentColor: hexColor.default("#f59e0b"),
    surfaceColor: hexColor.default("#ffffff"),
    textColor: hexColor.default("#111827"),
    typography: z.enum(["system", "serif", "rounded"]).default("system"),
  }),
  hero: z.object({
    eyebrow: optionalText(80),
    title: z.string().trim().min(2).max(140),
    subtitle: optionalText(320),
    imageUrl: optionalUrl.default(""),
    primaryCta: z.string().trim().min(1).max(40).default("View tours"),
  }),
  pages: z.object({
    home: pageSectionSchema,
    about: pageSectionSchema,
    faq: pageSectionSchema,
    policies: pageSectionSchema,
    contact: z.object({
      enabled: z.boolean().default(true),
      email: optionalEmail,
      phone: z.string().trim().max(60).optional().default(""),
      address: z.string().trim().max(240).optional().default(""),
    }),
  }),
  seo: z.object({
    title: z.string().trim().min(2).max(70),
    description: z.string().trim().min(20).max(180),
    socialImageUrl: optionalUrl.default(""),
  }),
});

export type StorefrontDraft = z.infer<typeof storefrontDraftSchema>;

export function defaultStorefrontDraft(workspace: { name: string; currency: string }): StorefrontDraft {
  return {
    brand: {
      brandName: workspace.name,
      logoUrl: null,
      faviconUrl: null,
      primaryColor: "#0f766e",
      secondaryColor: "#0f172a",
      accentColor: "#f59e0b",
      surfaceColor: "#ffffff",
      textColor: "#111827",
      typography: "system",
    },
    hero: {
      eyebrow: "Direct booking",
      title: workspace.name,
      subtitle: "Browse available experiences and book directly with the local operator.",
      imageUrl: null,
      primaryCta: "View tours",
    },
    pages: {
      home: {
        enabled: true,
        title: "Featured experiences",
        body: "Choose a tour, select a departure, and reserve online.",
      },
      about: {
        enabled: true,
        title: `About ${workspace.name}`,
        body: "",
      },
      faq: {
        enabled: true,
        title: "Frequently asked questions",
        body: "",
      },
      policies: {
        enabled: true,
        title: "Booking policies",
        body: "Policy text is a template until confirmed by the operator.",
      },
      contact: {
        enabled: true,
        email: null,
        phone: "",
        address: "",
      },
    },
    seo: {
      title: `${workspace.name} tours and experiences`,
      description: `Book tours and travel experiences directly with ${workspace.name}.`,
      socialImageUrl: null,
    },
  };
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const raw = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function validateStorefrontDraft(input: unknown) {
  const parsed = storefrontDraftSchema.parse(input);
  if (contrastRatio(parsed.brand.textColor, parsed.brand.surfaceColor) < 4.5) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["brand", "textColor"],
        message: "Text and surface colors must meet WCAG AA contrast.",
      },
    ]);
  }
  return parsed;
}
