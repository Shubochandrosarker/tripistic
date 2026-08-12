import { prisma } from "@/lib/db";
import { normalizeHostname } from "@/lib/domains/host";

import { cloudflareConfig } from "@/lib/cloudflare/config";
import { siteScriptName } from "@/lib/cloudflare/workers-platform";

/**
 * Hostname → deployed Worker resolution.
 *
 * The dispatch Worker owns every public site hostname and has to answer one
 * question per request: which script in the dispatch namespace serves this
 * host? Only Tripistic Core can answer it, because the mapping lives across
 * `Site`, `CustomDomain` and `SiteDeployment`.
 *
 * Two hostname shapes resolve here, and they are checked in this order:
 *
 *   1. `<subdomain>.<CLOUDFLARE_SITES_ROOT_DOMAIN>` — the Tripistic-owned
 *      address every site gets. Matched first because it is unambiguous and
 *      needs one indexed lookup on a unique column.
 *   2. A custom hostname bound to a site, and **only** when that domain is
 *      `active`. A domain still verifying must not route: serving a site from
 *      an unverified hostname is the dangling-hostname failure the domain
 *      lifecycle exists to prevent.
 *
 * A site with no live deployment resolves to `null` rather than to its script
 * name. The script may still exist in the namespace from a previous failed
 * publish, and routing to it would put a half-deployed build in front of
 * customers.
 */

export type SiteRoute = {
  scriptName: string;
  siteId: string;
  workspaceId: string;
  /** Preview deployments are served with `X-Robots-Tag: noindex`. */
  preview: boolean;
  deploymentId: string;
};

function subdomainFor(hostname: string): string | null {
  const root = cloudflareConfig().sitesRootDomain;
  if (!root) return null;
  const suffix = `.${root.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  // Exactly one label. `a.b.tripistic.site` is not a site address, and treating
  // it as one would let a wildcard certificate serve unexpected hosts.
  return label.length > 0 && !label.includes(".") ? label : null;
}

export async function resolveSiteRoute(rawHostname: string): Promise<SiteRoute | null> {
  const hostname = normalizeHostname(rawHostname);
  if (!hostname) return null;

  const subdomain = subdomainFor(hostname);

  const site = subdomain
    ? await prisma.site.findFirst({
        where: { subdomain, deletedAt: null },
        select: { id: true, workspaceId: true, status: true },
      })
    : await prisma.site
        .findFirst({
          where: {
            deletedAt: null,
            domains: { some: { hostname, status: "active" } },
          },
          select: { id: true, workspaceId: true, status: true },
        });

  if (!site) return null;
  // A suspended site is one an admin took down. It must stop serving
  // immediately, without waiting for a Worker to be deleted.
  if (site.status === "suspended") return null;

  const deployment = await prisma.siteDeployment.findFirst({
    where: { siteId: site.id, workspaceId: site.workspaceId, status: "live" },
    orderBy: { createdAt: "desc" },
    select: { id: true, environment: true },
  });
  if (!deployment) return null;

  return {
    scriptName: siteScriptName(site.workspaceId, site.id),
    siteId: site.id,
    workspaceId: site.workspaceId,
    preview: deployment.environment === "preview",
    deploymentId: deployment.id,
  };
}
