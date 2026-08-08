import type { Prisma, Site, SitePage } from "@prisma/client";

import { badRequest, conflict, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { assertFeature } from "@/lib/plans/entitlements";
import { getPlanLimit, getWorkspaceSubscription } from "@/lib/plans/limits";
import { slugify } from "@/lib/utils";

import {
  emptyPageContent,
  pageSeoSchema,
  siteNavigationSchema,
  siteSeoSchema,
  sitePagePathSchema,
  siteSubdomainSchema,
  validatePageContent,
  validateSiteTheme,
  type PageContent,
  type SiteTheme,
} from "@/lib/sites/schema";
import { findSiteTemplate, templatesForBusinessType } from "@/lib/sites/templates";

/**
 * Site Builder domain service.
 *
 * Every function here takes an already-verified `workspaceId` — callers get it
 * from `requireWorkspaceAccess`, never from a request body. Reads and writes
 * are scoped by it without exception, which is why `getSite` filters on
 * `{ id, workspaceId }` rather than looking a site up by id and checking the
 * workspace afterwards: the latter shape is one forgotten check away from a
 * cross-tenant read, and the difference is invisible in review.
 *
 * Publishing lives in `lib/sites/publish.ts`. This file owns the draft state.
 */

export type SiteWithPages = Site & { pages: SitePage[] };

/* ------------------------------------------------------------------------ */
/* Reads                                                                     */
/* ------------------------------------------------------------------------ */

export async function listSites(workspaceId: string) {
  return prisma.site.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { pages: true } },
      deployments: { orderBy: { createdAt: "desc" }, take: 1 },
      domains: { where: { status: { not: "disabled" } }, select: { hostname: true, status: true } },
    },
  });
}

export async function getSite(workspaceId: string, siteId: string): Promise<SiteWithPages> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, workspaceId, deletedAt: null },
    include: { pages: { orderBy: { position: "asc" } } },
  });
  if (!site) throw notFound("Site not found.");
  return site;
}

export async function getSitePage(workspaceId: string, siteId: string, pageId: string) {
  const page = await prisma.sitePage.findFirst({ where: { id: pageId, siteId, workspaceId } });
  if (!page) throw notFound("Page not found.");
  return page;
}

/* ------------------------------------------------------------------------ */
/* Limits                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Plan limits for the Site Builder.
 *
 * Read from the plan's `limits` JSON with a conservative default rather than
 * "unlimited". A plan seeded before these keys existed should not grant an
 * agency's allowance to a solo customer, and defaulting to unlimited is how
 * an unmetered feature reaches production unnoticed.
 */
const SITE_LIMIT_DEFAULTS = { sites: 1, site_pages: 12 } as const;

async function planLimit(workspaceId: string, key: keyof typeof SITE_LIMIT_DEFAULTS) {
  const subscription = await getWorkspaceSubscription(workspaceId);
  if (!subscription) {
    throw conflict("This workspace has no active subscription. Choose a plan to use the Site Builder.");
  }
  const configured = getPlanLimit(subscription.plan, key);
  return configured ?? SITE_LIMIT_DEFAULTS[key];
}

export async function assertCanCreateSite(workspaceId: string) {
  const limit = await planLimit(workspaceId, "sites");
  if (limit === -1) return;
  const current = await prisma.site.count({ where: { workspaceId, deletedAt: null } });
  if (current + 1 > limit) {
    throw conflict(
      `This plan includes ${limit} ${limit === 1 ? "website" : "websites"}. Delete one or upgrade to add another.`,
    );
  }
}

export async function assertCanAddPage(workspaceId: string, siteId: string) {
  const limit = await planLimit(workspaceId, "site_pages");
  if (limit === -1) return;
  const current = await prisma.sitePage.count({ where: { workspaceId, siteId } });
  if (current + 1 > limit) {
    throw conflict(`This plan includes ${limit} pages per website. Upgrade to add more.`);
  }
}

/* ------------------------------------------------------------------------ */
/* Subdomain allocation                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Finds a free subdomain derived from a name.
 *
 * The subdomain is a public hostname and therefore globally unique across all
 * tenants, so collisions between two operators called "City Walks" are normal
 * rather than exceptional and must resolve without an error the customer has
 * to understand. Bounded attempts, then a timestamp suffix — the same shape
 * `generateWorkspaceSlug` already uses, so the two behave alike.
 */
export async function allocateSubdomain(preferred: string): Promise<string> {
  const base = siteSubdomainSchema.safeParse(slugify(preferred));
  let candidate = base.success ? base.data : `site-${Date.now().toString(36)}`;
  for (let attempt = 1; attempt < 50; attempt += 1) {
    const existing = await prisma.site.findUnique({ where: { subdomain: candidate } });
    if (!existing) return candidate;
    candidate = `${base.success ? base.data : "site"}-${attempt + 1}`;
  }
  return `site-${Date.now().toString(36)}`;
}

/* ------------------------------------------------------------------------ */
/* Writes                                                                    */
/* ------------------------------------------------------------------------ */

export type CreateSiteInput = {
  workspaceId: string;
  userId: string;
  name: string;
  templateKey: string;
  subdomain?: string;
  request?: Request;
};

export async function createSite(input: CreateSiteInput) {
  await assertFeature(input.workspaceId, "storefront_builder");
  await assertCanCreateSite(input.workspaceId);

  const template = findSiteTemplate(input.templateKey);
  if (!template) throw badRequest("Unknown website template.");

  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { name: true },
  });
  if (!workspace) throw notFound("Workspace not found.");

  const subdomain = input.subdomain
    ? siteSubdomainSchema.parse(input.subdomain)
    : await allocateSubdomain(input.name || workspace.name);

  // Checked before the transaction for a clean message, and again by the
  // unique index inside it — the gap between the two is a real race when two
  // tabs submit at once, and only the index closes it.
  const taken = await prisma.site.findUnique({ where: { subdomain } });
  if (taken) throw conflict("That address is already taken. Try another.");

  const slug = slugify(input.name) || subdomain;
  const theme = validateSiteTheme(template.theme);

  const site = await prisma.$transaction(async (tx) => {
    const created = await tx.site.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        slug,
        subdomain,
        templateKey: template.key,
        status: "draft",
        theme: theme as unknown as Prisma.InputJsonValue,
        seo: siteSeoSchema.parse({
          defaultTitle: input.name,
          titleTemplate: `%s · ${input.name}`,
          organizationName: input.name,
        }) as unknown as Prisma.InputJsonValue,
        navigation: siteNavigationSchema.parse(template.navigation) as unknown as Prisma.InputJsonValue,
        createdById: input.userId,
      },
    });

    let position = 0;
    let homePageId: string | null = null;
    for (const page of template.pages) {
      const path = sitePagePathSchema.parse(page.path);
      const created_page = await tx.sitePage.create({
        data: {
          workspaceId: input.workspaceId,
          siteId: created.id,
          path,
          title: page.title,
          enabled: page.enabled,
          position,
          systemKey: page.systemKey ?? null,
          content: validatePageContent({
            version: 1,
            sections: page.sections,
          }) as unknown as Prisma.InputJsonValue,
          seo: pageSeoSchema.parse({}) as unknown as Prisma.InputJsonValue,
        },
      });
      if (path === "/") homePageId = created_page.id;
      position += 1;
    }

    return tx.site.update({ where: { id: created.id }, data: { homePageId } });
  });

  await recordAuditEvent({
    action: "site_created",
    workspaceId: input.workspaceId,
    userId: input.userId,
    entityType: "site",
    entityId: site.id,
    metadata: { templateKey: template.key, subdomain },
    request: input.request,
  });

  return site;
}

export async function updateSiteSettings(input: {
  workspaceId: string;
  userId: string;
  siteId: string;
  name?: string;
  theme?: unknown;
  seo?: unknown;
  navigation?: unknown;
  request?: Request;
}) {
  const site = await getSite(input.workspaceId, input.siteId);

  const data: Prisma.SiteUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.theme !== undefined) {
    data.theme = validateSiteTheme(input.theme) as unknown as Prisma.InputJsonValue;
  }
  if (input.seo !== undefined) {
    data.seo = siteSeoSchema.parse(input.seo) as unknown as Prisma.InputJsonValue;
  }
  if (input.navigation !== undefined) {
    data.navigation = siteNavigationSchema.parse(input.navigation) as unknown as Prisma.InputJsonValue;
  }

  const updated = await prisma.site.update({ where: { id: site.id }, data });

  await recordAuditEvent({
    action: "site_settings_updated",
    workspaceId: input.workspaceId,
    userId: input.userId,
    entityType: "site",
    entityId: site.id,
    metadata: { fields: Object.keys(data).join(",") },
    request: input.request,
  });

  return updated;
}

export async function createSitePage(input: {
  workspaceId: string;
  userId: string;
  siteId: string;
  path: string;
  title: string;
  content?: unknown;
}) {
  const site = await getSite(input.workspaceId, input.siteId);
  await assertCanAddPage(input.workspaceId, site.id);

  const path = sitePagePathSchema.parse(input.path);
  const existing = await prisma.sitePage.findFirst({ where: { siteId: site.id, path } });
  if (existing) throw conflict("A page already exists at that path.");

  const content = input.content ? validatePageContent(input.content) : emptyPageContent();
  const position = await prisma.sitePage.count({ where: { siteId: site.id } });

  return prisma.sitePage.create({
    data: {
      workspaceId: input.workspaceId,
      siteId: site.id,
      path,
      title: input.title,
      position,
      content: content as unknown as Prisma.InputJsonValue,
      seo: pageSeoSchema.parse({}) as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function updateSitePage(input: {
  workspaceId: string;
  siteId: string;
  pageId: string;
  title?: string;
  path?: string;
  enabled?: boolean;
  content?: unknown;
  seo?: unknown;
}) {
  const page = await getSitePage(input.workspaceId, input.siteId, input.pageId);

  const data: Prisma.SitePageUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.content !== undefined) {
    data.content = validatePageContent(input.content) as unknown as Prisma.InputJsonValue;
  }
  if (input.seo !== undefined) {
    data.seo = pageSeoSchema.parse(input.seo) as unknown as Prisma.InputJsonValue;
  }
  if (input.path !== undefined) {
    const path = sitePagePathSchema.parse(input.path);
    if (path !== page.path) {
      // A template-owned page has a fixed path the generated Worker routes to;
      // moving it would break the route without telling anyone.
      if (page.systemKey) throw conflict("This page's address is fixed by the template.");
      const clash = await prisma.sitePage.findFirst({ where: { siteId: input.siteId, path } });
      if (clash) throw conflict("A page already exists at that path.");
      data.path = path;
    }
  }

  return prisma.sitePage.update({ where: { id: page.id }, data });
}

export async function deleteSitePage(input: {
  workspaceId: string;
  siteId: string;
  pageId: string;
}) {
  const page = await getSitePage(input.workspaceId, input.siteId, input.pageId);
  if (page.systemKey) {
    throw conflict("This page is part of the template and can be disabled but not deleted.");
  }
  if (page.path === "/") throw conflict("The homepage cannot be deleted.");
  await prisma.sitePage.delete({ where: { id: page.id } });
}

export async function reorderSitePages(input: {
  workspaceId: string;
  siteId: string;
  orderedPageIds: string[];
}) {
  const site = await getSite(input.workspaceId, input.siteId);
  const owned = new Set(site.pages.map((page) => page.id));
  // Refuse the whole reorder if any id is not this site's. Applying the valid
  // subset would silently drop the operator's intent and, worse, accept an id
  // from another tenant's site as a no-op rather than as an error.
  if (input.orderedPageIds.some((id) => !owned.has(id))) {
    throw badRequest("Page list does not match this site.");
  }

  await prisma.$transaction(
    input.orderedPageIds.map((id, index) =>
      prisma.sitePage.update({ where: { id }, data: { position: index } }),
    ),
  );
}

export async function deleteSite(input: {
  workspaceId: string;
  userId: string;
  siteId: string;
  request?: Request;
}) {
  const site = await getSite(input.workspaceId, input.siteId);

  // Soft delete. The published Worker is torn down by the caller, but the
  // revision history and deployment record are forensic data — an operator who
  // deletes the wrong site should be recoverable by support, not by a backup
  // restore.
  const deleted = await prisma.site.update({
    where: { id: site.id },
    data: { deletedAt: new Date(), status: "suspended" },
  });

  await recordAuditEvent({
    action: "site_deleted",
    workspaceId: input.workspaceId,
    userId: input.userId,
    entityType: "site",
    entityId: site.id,
    metadata: { subdomain: site.subdomain },
    request: input.request,
  });

  return deleted;
}

/* ------------------------------------------------------------------------ */
/* Template catalogue                                                        */
/* ------------------------------------------------------------------------ */

export async function listTemplatesForWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { businessType: true },
  });
  if (!workspace) throw notFound("Workspace not found.");
  return templatesForBusinessType(workspace.businessType).map((template) => ({
    key: template.key,
    name: template.name,
    description: template.description,
    pageCount: template.pages.length,
  }));
}

/** Reads a page's stored content back through the schema. */
export function parsePageContent(value: Prisma.JsonValue): PageContent {
  return validatePageContent(value);
}

export function parseSiteTheme(value: Prisma.JsonValue): SiteTheme {
  return validateSiteTheme(value);
}
