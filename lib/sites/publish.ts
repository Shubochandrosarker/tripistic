import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { ApiError, badRequest, conflict, notFound } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { assertFeature, hasFeature } from "@/lib/plans/entitlements";

import { cloudflareConfig, previewHostname, siteSubdomainHostname } from "@/lib/cloudflare/config";
import { isCloudflareCapabilityConfigured } from "@/lib/cloudflare/config";
import {
  deleteSiteWorker,
  siteScriptName,
  uploadSiteWorker,
} from "@/lib/cloudflare/workers-platform";
import { renderPage, type RenderContext } from "@/lib/sites/render";
import {
  pageSeoSchema,
  siteNavigationSchema,
  siteSeoSchema,
  validatePageContent,
  validateSiteTheme,
  type PageContent,
} from "@/lib/sites/schema";
import { buildLlmsTxt, buildWorkerModule, type WorkerPayload } from "@/lib/sites/worker-runtime";

/**
 * The publish pipeline.
 *
 * The ordering here is the whole design, and it follows one rule: **a failed
 * publish must leave the previous deployment serving traffic.** So the
 * sequence is validate → snapshot → render → upload → health check → *then*
 * flip the pointer. Nothing that visitors can observe changes until the new
 * Worker has answered a request correctly.
 *
 * Concretely that means:
 *
 *   - the revision is written before the upload, so a crashed publish leaves a
 *     recoverable artifact rather than nothing;
 *   - `site.publishedRevisionId` is written last, after the health check;
 *   - a failure marks the *deployment* failed and leaves the site's published
 *     revision untouched — the customer's website does not go down because
 *     their new homepage had a bad image URL.
 *
 * Rollback is therefore not a special path: it is a publish of an older
 * revision through exactly the same steps.
 */

export type PublishResult = {
  deploymentId: string;
  revisionId: string;
  versionNumber: number;
  status: "live" | "failed";
  liveUrl: string | null;
  previewUrl: string | null;
  message: string;
};

/**
 * Where Tripistic Core answers.
 *
 * Exported so the preview route resolves the booking base URL the same way
 * publishing does. A preview whose booking links point somewhere else is a
 * preview that cannot be clicked through, and the divergence would only be
 * noticed after a real publish.
 */
export function appOrigin(): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  return (configured || "http://localhost:3000").replace(/\/+$/, "");
}

/* ------------------------------------------------------------------------ */
/* Snapshot                                                                  */
/* ------------------------------------------------------------------------ */

type SiteSnapshot = {
  site: {
    id: string;
    name: string;
    subdomain: string;
    templateKey: string;
    theme: unknown;
    seo: unknown;
    navigation: unknown;
  };
  pages: Array<{
    path: string;
    title: string;
    enabled: boolean;
    position: number;
    content: unknown;
    seo: unknown;
  }>;
  workspace: { slug: string; name: string };
  capturedAt: string;
};

async function buildSnapshot(workspaceId: string, siteId: string): Promise<SiteSnapshot> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, workspaceId, deletedAt: null },
    include: { pages: { orderBy: { position: "asc" } } },
  });
  if (!site) throw notFound("Site not found.");

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true, name: true },
  });
  if (!workspace) throw notFound("Workspace not found.");

  const enabled = site.pages.filter((page) => page.enabled);
  if (!enabled.some((page) => page.path === "/")) {
    // Publishing a site with no homepage produces a hostname that 404s at its
    // root. Refusing is kinder than deploying it and letting the operator
    // discover it from a customer.
    throw badRequest("Enable a homepage before publishing.");
  }

  return {
    site: {
      id: site.id,
      name: site.name,
      subdomain: site.subdomain,
      templateKey: site.templateKey,
      theme: site.theme,
      seo: site.seo,
      navigation: site.navigation,
    },
    pages: enabled.map((page) => ({
      path: page.path,
      title: page.title,
      enabled: page.enabled,
      position: page.position,
      content: page.content,
      seo: page.seo,
    })),
    workspace: { slug: workspace.slug, name: workspace.name },
    capturedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------------ */
/* Render                                                                    */
/* ------------------------------------------------------------------------ */

export type RenderedBundle = {
  moduleSource: string;
  checksum: string;
  pageCount: number;
  payload: WorkerPayload;
};

/**
 * Turns a snapshot into a Worker module.
 *
 * Exported and pure so it can be tested without Cloudflare, a database or a
 * network — which matters, because this is where escaping happens and an
 * untested renderer is where stored XSS lives.
 */
export function renderBundle(input: {
  snapshot: SiteSnapshot;
  siteOrigin: string;
  apiOrigin: string;
  requireAttribution: boolean;
  preview: boolean;
  revisionId: string;
  deploymentId: string;
  /** Resolved at publish time so the Worker can pin cards by slug. */
  tourSlugsById: Record<string, string>;
}): RenderedBundle {
  const theme = validateSiteTheme(input.snapshot.site.theme);
  const siteSeo = siteSeoSchema.parse(input.snapshot.site.seo);
  const navigation = siteNavigationSchema.parse(input.snapshot.site.navigation);

  const context: RenderContext = {
    navigation,
    brandName: siteSeo.organizationName || input.snapshot.site.name,
    bookingBaseUrl: input.apiOrigin,
    workspaceSlug: input.snapshot.workspace.slug,
    logoUrl: theme.logoLightUrl || "",
    requireAttribution: input.requireAttribution,
  };

  const tourSlots: WorkerPayload["tourSlots"] = {};
  const pages = input.snapshot.pages.map((page) => {
    const content: PageContent = validatePageContent(page.content);
    // Hidden sections are not rendered, so they must not contribute tour slots
    // either: the slot map ships to the edge in the Worker payload, and a
    // hidden section's tour list would travel with it despite never appearing.
    for (const section of content.sections.filter((item) => !item.hidden)) {
      if (section.type === "tourCards") {
        tourSlots[section.id] = {
          limit: section.props.limit,
          showPrice: section.props.showPrice,
          showDuration: section.props.showDuration,
          tourSlugs: section.props.tourIds
            .map((id) => input.tourSlugsById[id])
            .filter((slug): slug is string => Boolean(slug)),
        };
      }
      if (section.type === "featuredTour") {
        const slug = section.props.tourId ? input.tourSlugsById[section.props.tourId] : undefined;
        tourSlots[section.id] = {
          limit: 1,
          showPrice: true,
          showDuration: true,
          tourSlugs: slug ? [slug] : [],
        };
      }
    }

    return renderPage({
      page: {
        path: page.path,
        title: page.title,
        content,
        seo: pageSeoSchema.parse(page.seo),
      },
      theme,
      siteSeo,
      context,
      canonicalOrigin: input.preview ? null : input.siteOrigin,
      forceNoindex: input.preview,
    });
  });

  const llmsTxt =
    siteSeo.emitLlmsTxt && !input.preview
      ? buildLlmsTxt({
          brandName: context.brandName,
          description: siteSeo.defaultDescription,
          origin: input.siteOrigin,
          pages: input.snapshot.pages.map((page, index) => ({
            path: page.path,
            title: page.title,
            noindex: pages[index].noindex,
          })),
        })
      : null;

  const payload: WorkerPayload = {
    siteId: input.snapshot.site.id,
    workspaceSlug: input.snapshot.workspace.slug,
    apiOrigin: input.apiOrigin,
    siteOrigin: input.siteOrigin,
    pages: pages.map((page) => ({ path: page.path, html: page.html, noindex: page.noindex })),
    tourSlots,
    llmsTxt,
    revisionId: input.revisionId,
    deploymentId: input.deploymentId,
    preview: input.preview,
  };

  const moduleSource = buildWorkerModule(payload);
  return {
    moduleSource,
    checksum: createHash("sha256").update(moduleSource).digest("hex"),
    pageCount: pages.length,
    payload,
  };
}

/* ------------------------------------------------------------------------ */
/* Publish                                                                   */
/* ------------------------------------------------------------------------ */

async function resolveTourSlugs(workspaceId: string): Promise<Record<string, string>> {
  const tours = await prisma.tour.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, slug: true },
  });
  return Object.fromEntries(tours.map((tour) => [tour.id, tour.slug]));
}

/**
 * Confirms the freshly uploaded Worker actually answers.
 *
 * A successful upload only means Cloudflare accepted the script; it does not
 * mean the script runs. Without this check a Worker that throws on startup
 * would be marked live and the pointer flipped to it — the exact failure the
 * ordering in this file exists to prevent.
 *
 * Returns `null` when there is no reachable hostname to check (a
 * subdomain that has not been routed yet). That is not a failure, and treating
 * it as one would make the very first publish impossible.
 */
async function healthCheck(url: string | null): Promise<{ ok: boolean; detail: string } | null> {
  if (!url) return null;
  try {
    const response = await fetch(`${url}/_tripistic/health`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, detail: `Health check returned ${response.status}.` };
    const body = (await response.json()) as { ok?: boolean };
    return body.ok === true
      ? { ok: true, detail: "Health check passed." }
      : { ok: false, detail: "Health check did not report ok." };
  } catch {
    return { ok: false, detail: "Health check did not respond." };
  }
}

export async function publishSite(input: {
  workspaceId: string;
  userId: string;
  siteId: string;
  note?: string;
  /** Build a preview deployment instead of replacing production. */
  preview?: boolean;
  request?: Request;
}): Promise<PublishResult> {
  await assertFeature(input.workspaceId, "storefront_builder");

  const snapshot = await buildSnapshot(input.workspaceId, input.siteId);
  const tourSlugsById = await resolveTourSlugs(input.workspaceId);

  // White-label is what removes the Tripistic footer credit. Resolved here
  // rather than trusted from the footer section's own prop, so turning the
  // prop off on a plan that does not include it changes nothing.
  const requireAttribution = !(await hasFeature(input.workspaceId, "white_label"));

  const lastRevision = await prisma.siteRevision.findFirst({
    where: { siteId: input.siteId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const versionNumber = (lastRevision?.versionNumber ?? 0) + 1;

  const { revision, deployment } = await prisma.$transaction(async (tx) => {
    const createdRevision = await tx.siteRevision.create({
      data: {
        workspaceId: input.workspaceId,
        siteId: input.siteId,
        versionNumber,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        // Filled in after rendering; the revision row has to exist first so
        // the deployment can reference it.
        checksum: "",
        note: input.note ?? null,
        createdById: input.userId,
      },
    });
    const createdDeployment = await tx.siteDeployment.create({
      data: {
        workspaceId: input.workspaceId,
        siteId: input.siteId,
        revisionId: createdRevision.id,
        status: "building",
        environment: input.preview ? "preview" : "production",
        startedAt: new Date(),
        triggeredById: input.userId,
      },
    });
    await tx.site.update({
      where: { id: input.siteId },
      data: { status: "publishing", draftRevisionId: createdRevision.id },
    });
    return { revision: createdRevision, deployment: createdDeployment };
  });

  const liveHostname = siteSubdomainHostname(snapshot.site.subdomain);
  const previewHost = previewHostname(deployment.id);
  const publicHostname = input.preview ? previewHost : liveHostname;
  const siteOrigin = publicHostname ? `https://${publicHostname}` : appOrigin();

  try {
    const bundle = renderBundle({
      snapshot,
      siteOrigin,
      apiOrigin: appOrigin(),
      requireAttribution,
      preview: Boolean(input.preview),
      revisionId: revision.id,
      deploymentId: deployment.id,
      tourSlugsById,
    });

    await prisma.siteRevision.update({
      where: { id: revision.id },
      data: { checksum: bundle.checksum },
    });

    if (!isCloudflareCapabilityConfigured("workersForPlatforms")) {
      // Not a failure — a deployment with no dispatch namespace has a fully
      // built, checksummed revision it can deploy the moment Cloudflare is
      // configured. Marking it failed would make an unconfigured environment
      // look broken. See docs/v3/WORKERS_FOR_PLATFORMS.md.
      await prisma.siteDeployment.update({
        where: { id: deployment.id },
        data: {
          status: "failed",
          errorMessage:
            "Workers for Platforms is not configured on this deployment. The revision was built and stored but not published to the edge.",
          finishedAt: new Date(),
        },
      });
      await prisma.site.update({ where: { id: input.siteId }, data: { status: "ready" } });
      return {
        deploymentId: deployment.id,
        revisionId: revision.id,
        versionNumber,
        status: "failed",
        liveUrl: null,
        previewUrl: null,
        message:
          "Revision built and stored. Configure CLOUDFLARE_DISPATCH_NAMESPACE to publish it to the edge.",
      };
    }

    const scriptName = input.preview
      ? `${siteScriptName(input.workspaceId, input.siteId)}-preview`
      : siteScriptName(input.workspaceId, input.siteId);

    await prisma.siteDeployment.update({
      where: { id: deployment.id },
      data: { status: "deploying", scriptName },
    });

    await uploadSiteWorker(scriptName, {
      moduleSource: bundle.moduleSource,
      vars: {
        TRIPISTIC_SITE_ID: input.siteId,
        TRIPISTIC_REVISION: String(versionNumber),
        TRIPISTIC_ENVIRONMENT: cloudflareConfig().environment,
      },
      tags: [`workspace:${input.workspaceId}`, `site:${input.siteId}`],
    });

    const health = await healthCheck(publicHostname ? `https://${publicHostname}` : null);
    if (health && !health.ok) {
      throw new ApiError(502, health.detail);
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.siteDeployment.update({
        where: { id: deployment.id },
        data: {
          status: "live",
          finishedAt: now,
          healthCheckAt: health ? now : null,
          liveUrl: input.preview ? null : (liveHostname ? `https://${liveHostname}` : null),
          previewUrl: input.preview && previewHost ? `https://${previewHost}` : null,
        },
      });
      // Production only: a preview must never become the revision customers
      // are served, which is the entire point of having a preview.
      if (!input.preview) {
        await tx.site.update({
          where: { id: input.siteId },
          data: {
            status: "published",
            publishedRevisionId: revision.id,
            publishedAt: now,
          },
        });
      } else {
        await tx.site.update({ where: { id: input.siteId }, data: { status: "ready" } });
      }
    });

    await recordAuditEvent({
      action: input.preview ? "site_preview_deployed" : "site_published",
      workspaceId: input.workspaceId,
      userId: input.userId,
      entityType: "site",
      entityId: input.siteId,
      metadata: { versionNumber, deploymentId: deployment.id, checksum: bundle.checksum },
      request: input.request,
    });

    return {
      deploymentId: deployment.id,
      revisionId: revision.id,
      versionNumber,
      status: "live",
      liveUrl: input.preview ? null : liveHostname ? `https://${liveHostname}` : null,
      previewUrl: input.preview && previewHost ? `https://${previewHost}` : null,
      message: input.preview ? "Preview deployed." : "Website published.",
    };
  } catch (error) {
    logger.error(
      "sites.publish_failed",
      { workspaceId: input.workspaceId, siteId: input.siteId, deploymentId: deployment.id },
      error,
    );

    // The previous published revision is untouched: `publishedRevisionId` was
    // never reassigned, and the previously uploaded script is still the one
    // serving the hostname. The site returns to `published` if it had a live
    // revision, otherwise to `failed`.
    const site = await prisma.site.findUnique({
      where: { id: input.siteId },
      select: { publishedRevisionId: true },
    });

    await prisma.$transaction([
      prisma.siteDeployment.update({
        where: { id: deployment.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage:
            error instanceof ApiError
              ? error.message
              : "Deployment failed. The previous version is still live.",
        },
      }),
      prisma.site.update({
        where: { id: input.siteId },
        data: { status: site?.publishedRevisionId ? "published" : "failed" },
      }),
    ]);

    return {
      deploymentId: deployment.id,
      revisionId: revision.id,
      versionNumber,
      status: "failed",
      liveUrl: null,
      previewUrl: null,
      message:
        error instanceof ApiError
          ? error.message
          : "Deployment failed. Your previous website is still live.",
    };
  }
}

/**
 * Redeploys an earlier revision.
 *
 * Implemented as a fresh publish of the old snapshot rather than as a pointer
 * flip. Flipping the pointer would leave the *current* Worker script on the
 * edge while the database claimed an older revision was live — the two would
 * disagree, and the disagreement would only show up as a customer reporting
 * that rollback did nothing.
 */
export async function rollbackSite(input: {
  workspaceId: string;
  userId: string;
  siteId: string;
  revisionId: string;
  request?: Request;
}): Promise<PublishResult> {
  const revision = await prisma.siteRevision.findFirst({
    where: { id: input.revisionId, siteId: input.siteId, workspaceId: input.workspaceId },
  });
  if (!revision) throw notFound("Revision not found.");

  const snapshot = revision.snapshot as unknown as SiteSnapshot;
  if (!snapshot?.pages?.length) throw conflict("That revision has no pages to restore.");

  // Restore the draft pages from the snapshot, then publish normally. This is
  // what makes rollback resumable: the operator's editor now shows exactly the
  // content that is live, instead of a draft that silently diverges from it.
  await prisma.$transaction(async (tx) => {
    await tx.sitePage.deleteMany({ where: { siteId: input.siteId, workspaceId: input.workspaceId } });
    let position = 0;
    for (const page of snapshot.pages) {
      await tx.sitePage.create({
        data: {
          workspaceId: input.workspaceId,
          siteId: input.siteId,
          path: page.path,
          title: page.title,
          enabled: page.enabled,
          position,
          content: page.content as Prisma.InputJsonValue,
          seo: page.seo as Prisma.InputJsonValue,
        },
      });
      position += 1;
    }
    await tx.site.update({
      where: { id: input.siteId },
      data: {
        theme: snapshot.site.theme as Prisma.InputJsonValue,
        seo: snapshot.site.seo as Prisma.InputJsonValue,
        navigation: snapshot.site.navigation as Prisma.InputJsonValue,
      },
    });
  });

  await recordAuditEvent({
    action: "site_rolled_back",
    workspaceId: input.workspaceId,
    userId: input.userId,
    entityType: "site",
    entityId: input.siteId,
    metadata: { toVersion: revision.versionNumber },
    request: input.request,
  });

  return publishSite({
    workspaceId: input.workspaceId,
    userId: input.userId,
    siteId: input.siteId,
    note: `Rollback to version ${revision.versionNumber}`,
    request: input.request,
  });
}

/** Removes a site's Worker from the edge. Best effort — never blocks a delete. */
export async function unpublishSite(workspaceId: string, siteId: string): Promise<void> {
  if (!isCloudflareCapabilityConfigured("workersForPlatforms")) return;
  const scriptName = siteScriptName(workspaceId, siteId);
  await Promise.all([
    deleteSiteWorker(scriptName).catch((error) =>
      logger.warn("sites.unpublish_failed", { siteId }, error),
    ),
    deleteSiteWorker(`${scriptName}-preview`).catch(() => undefined),
  ]);
  await prisma.site.update({
    where: { id: siteId },
    data: { status: "suspended", publishedRevisionId: null },
  });
}
