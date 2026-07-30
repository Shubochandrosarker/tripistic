import { cache } from "react";
import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import { hasFeature } from "@/lib/plans/entitlements";
import { normalizeHostname, platformSubdomain } from "@/lib/domains/host";
import { STOREFRONT_SLUG_HEADER } from "@/lib/storefront/tenant-header";
import { validateStorefrontDraft, defaultStorefrontDraft } from "@/lib/storefront/schema";

/**
 * Brand identity for the public guest journey.
 *
 * The gap this closes. An operator configures their brand name, logo and
 * colours in the storefront builder, and all of it was applied *inside*
 * `PublicStorefront` only. Everything around it — the header on their own
 * custom domain, the footer, the tour page, checkout, the confirmation page a
 * guest lands on after paying — rendered a Tripistic logo, the word
 * "Tripistic", and "Powered by Tripistic".
 *
 * So a customer on a paid plan, who had pointed their own domain at us,
 * showed their guests a page branded by their software vendor. That is the
 * white-label feature not working rather than working partially: the one
 * thing white-label means is that the vendor is not visible.
 *
 * Resolution is per-request and cached, because the layout and the page both
 * need it and neither should pay for it twice.
 */

export type PublicBranding = {
  workspaceId: string;
  workspaceSlug: string;
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  /**
   * Whether the "Powered by Tripistic" line is shown.
   *
   * This is the actual commercial substance of the `white_label` entitlement,
   * so it is resolved from the plan rather than from a storefront setting an
   * operator could simply switch off. Every plan currently includes it (see
   * the catalog), but the gate is real: it is checked server-side and a plan
   * that turns the flag off hides nothing else, only this.
   */
  showPlatformAttribution: boolean;
};

const FALLBACK: Omit<PublicBranding, "workspaceId" | "workspaceSlug"> = {
  brandName: "Tripistic",
  logoUrl: null,
  primaryColor: "#0f766e",
  secondaryColor: "#0f172a",
  accentColor: "#f59e0b",
  surfaceColor: "#ffffff",
  textColor: "#111827",
  showPlatformAttribution: true,
};

async function brandingForWorkspaceSlug(slug: string): Promise<PublicBranding | null> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug, status: "active", deletedAt: null },
    select: { id: true, slug: true, name: true, currency: true, storefront: true },
  });
  if (!workspace) return null;

  const draft =
    workspace.storefront?.status === "published" && workspace.storefront.published
      ? validateStorefrontDraft(workspace.storefront.published)
      : defaultStorefrontDraft(workspace);

  // A workspace whose plan includes white-label has the attribution removed.
  const whiteLabelled = await hasFeature(workspace.id, "white_label");

  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    brandName: draft.brand.brandName || workspace.name,
    logoUrl: draft.brand.logoUrl,
    primaryColor: draft.brand.primaryColor,
    secondaryColor: draft.brand.secondaryColor,
    accentColor: draft.brand.accentColor,
    surfaceColor: draft.brand.surfaceColor,
    textColor: draft.brand.textColor,
    showPlatformAttribution: !whiteLabelled,
  };
}

/**
 * Resolves branding from the request itself.
 *
 * Public layouts do not receive route params, so the tenant has to come from
 * the host. Middleware has already rewritten a custom hostname to
 * `/_host/<hostname>/...` and a platform subdomain to `/book/<slug>/...`, but
 * the original `Host` header survives the rewrite, which is what this reads.
 *
 * Returns Tripistic's own identity when no tenant can be determined — the
 * marketing site and any unrecognised host — so the fallback is never an
 * operator's brand leaking onto the wrong page.
 */
export const resolvePublicBranding = cache(async (): Promise<PublicBranding | null> => {
  const headerList = await headers();

  // Middleware resolves the tenant for every shape a storefront URL can take
  // and stamps it here — including `tripistic.com/book/<slug>` on the apex,
  // where there is no host to resolve from. It always overwrites, so a client
  // cannot supply this to render someone else's brand.
  const stamped = headerList.get(STOREFRONT_SLUG_HEADER);
  if (stamped) return brandingForWorkspaceSlug(stamped);

  const hostname = normalizeHostname(
    headerList.get("x-forwarded-host") ?? headerList.get("host"),
  );
  if (!hostname) return null;

  const subdomain = platformSubdomain(hostname);
  if (subdomain) return brandingForWorkspaceSlug(subdomain);

  const domain = await prisma.customDomain.findFirst({
    where: { hostname, status: "active" },
    select: { workspace: { select: { slug: true } } },
  });
  if (!domain) return null;

  return brandingForWorkspaceSlug(domain.workspace.slug);
});

/** Branding for a known workspace slug — used where the route already knows it. */
export const publicBrandingForSlug = cache(brandingForWorkspaceSlug);

export function fallbackBranding(): Omit<PublicBranding, "workspaceId" | "workspaceSlug"> {
  return FALLBACK;
}

/**
 * CSS custom properties for the operator's palette.
 *
 * Applied on the layout wrapper so the whole guest journey inherits it, not
 * just the storefront landing page — the tour page, the booking form and the
 * confirmation page are equally part of what a guest sees.
 */
export function brandingCssVariables(branding: Pick<
  PublicBranding,
  "primaryColor" | "secondaryColor" | "accentColor" | "surfaceColor" | "textColor"
>): React.CSSProperties {
  return {
    "--storefront-primary": branding.primaryColor,
    "--storefront-secondary": branding.secondaryColor,
    "--storefront-accent": branding.accentColor,
    "--storefront-surface": branding.surfaceColor,
    "--storefront-text": branding.textColor,
  } as React.CSSProperties;
}
