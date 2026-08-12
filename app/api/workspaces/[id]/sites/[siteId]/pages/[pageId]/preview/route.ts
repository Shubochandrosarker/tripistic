import { z } from "zod";

import { handleApiError } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { hasFeature } from "@/lib/plans/entitlements";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

import { appOrigin } from "@/lib/sites/publish";
import { renderPage } from "@/lib/sites/render";
import {
  pageSeoSchema,
  siteNavigationSchema,
  siteSeoSchema,
  validatePageContent,
  validateSiteTheme,
} from "@/lib/sites/schema";
import { getSite, getSitePage } from "@/lib/sites/service";

type Params = { params: Promise<{ id: string; siteId: string; pageId: string }> };

const previewSchema = z.object({
  /** Unsaved editor state. Omit to preview what is stored. */
  content: z.unknown().optional(),
  theme: z.unknown().optional(),
});

/**
 * Renders one page exactly as publishing would.
 *
 * This deliberately calls `renderPage` — the same function the publish
 * pipeline uses — rather than a React approximation of it. A preview built
 * from different code is a preview that is wrong in precisely the cases that
 * matter: escaping, structured data, the attribution footer, and every section
 * type nobody thought to mirror. Reusing the renderer means "what you see" and
 * "what gets deployed" cannot diverge.
 *
 * The response is HTML for an iframe, and is unconditionally `noindex` and
 * `no-store`. It is also served from the app origin rather than the site
 * origin, so it renders inside a sandboxed frame with no access to the
 * dashboard session.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId, pageId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });

    const [site, page] = await Promise.all([getSite(id, siteId), getSitePage(id, siteId, pageId)]);
    const body = previewSchema.parse((await request.json().catch(() => null)) ?? {});

    // Draft content is validated here even though it is not being saved. A
    // preview that renders something the schema would reject teaches the
    // operator that it is fine, and the error then appears at publish.
    const content = validatePageContent(body.content ?? page.content);
    const theme = validateSiteTheme(body.theme ?? site.theme);
    const siteSeo = siteSeoSchema.parse(site.seo);

    const rendered = renderPage({
      page: {
        path: page.path,
        title: page.title,
        content,
        seo: pageSeoSchema.parse(page.seo),
      },
      theme,
      siteSeo,
      context: {
        navigation: siteNavigationSchema.parse(site.navigation),
        brandName: siteSeo.organizationName || site.name,
        bookingBaseUrl: appOrigin(),
        workspaceSlug: membership.workspace.slug,
        logoUrl: theme.logoLightUrl || "",
        // Resolved from the plan, never from the footer's own prop — the same
        // rule publishing applies, so a preview cannot show an un-attributed
        // footer that publish would then re-attribute.
        requireAttribution: !(await hasFeature(id, "white_label")),
      },
      canonicalOrigin: null,
      forceNoindex: true,
    });

    return new Response(rendered.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
        // The preview is tenant-authored content rendered on the app origin.
        // Framing it anywhere else would let a third-party page present it as
        // its own; the editor frames it same-origin, which this still allows.
        "X-Frame-Options": "SAMEORIGIN",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
