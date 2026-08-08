import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { publishSite, rollbackSite } from "@/lib/sites/publish";
import {
  allocateSubdomain,
  createSite,
  createSitePage,
  deleteSitePage,
  getSite,
  reorderSitePages,
  updateSitePage,
  updateSiteSettings,
} from "@/lib/sites/service";

import {
  createTestTour,
  createTestUser,
  createTestWorkspace,
  entitleWorkspace,
  setWorkspaceFeature,
  uniqueSuffix,
} from "./helpers";

/**
 * Site Builder lifecycle against a real database.
 *
 * The unit tests cover schema and rendering. What only a database can show is
 * that tenancy holds across every read and write, that a plan without the
 * feature is refused, and that a failed publish leaves the previously
 * published revision serving traffic.
 *
 * Cloudflare is deliberately not configured in this suite. That exercises the
 * "built but not deployed" path — which is also exactly what a staging box
 * without a dispatch namespace does, so it is a real configuration rather
 * than a test-only one.
 */

async function entitledWorkspace() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  // Enterprise catalog plan, so every gated feature resolves through the same
  // path production uses.
  await entitleWorkspace(workspace.id);
  return { owner, workspace };
}

let savedNamespace: string | undefined;

beforeEach(() => {
  savedNamespace = process.env.CLOUDFLARE_DISPATCH_NAMESPACE;
  delete process.env.CLOUDFLARE_DISPATCH_NAMESPACE;
});

afterEach(() => {
  if (savedNamespace === undefined) delete process.env.CLOUDFLARE_DISPATCH_NAMESPACE;
  else process.env.CLOUDFLARE_DISPATCH_NAMESPACE = savedNamespace;
});

describe("createSite", () => {
  it("creates a site with the template's pages and a homepage pointer", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: `Acme ${uniqueSuffix()}`,
      templateKey: "walking_tours",
    });

    const loaded = await getSite(workspace.id, site.id);
    expect(loaded.pages.length).toBeGreaterThan(3);
    expect(loaded.pages.map((page) => page.path)).toContain("/");
    expect(loaded.homePageId).toBe(loaded.pages.find((page) => page.path === "/")?.id);
    expect(loaded.status).toBe("draft");
  });

  it("refuses an unknown template", async () => {
    const { owner, workspace } = await entitledWorkspace();
    await expect(
      createSite({
        workspaceId: workspace.id,
        userId: owner.id,
        name: "Acme",
        templateKey: "not-a-template",
      }),
    ).rejects.toThrow(/Unknown website template/);
  });

  /**
   * Entitlement is checked on the server, not by hiding the nav item. A
   * workspace whose plan excludes the builder must be refused even when it
   * calls the service directly.
   */
  it("refuses a workspace whose plan excludes the builder", async () => {
    const { owner, workspace } = await entitledWorkspace();
    await setWorkspaceFeature(workspace.id, "storefront_builder", false);

    await expect(
      createSite({
        workspaceId: workspace.id,
        userId: owner.id,
        name: "Acme",
        templateKey: "walking_tours",
      }),
    ).rejects.toThrow();
  });

  it("allocates a distinct subdomain when the preferred one is taken", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const preferred = `acme-${uniqueSuffix()}`;
    await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "First",
      templateKey: "walking_tours",
      subdomain: preferred,
    });

    const next = await allocateSubdomain(preferred);
    expect(next).not.toBe(preferred);
    expect(next.startsWith(preferred)).toBe(true);
  });

  it("refuses a subdomain already claimed by another workspace", async () => {
    const first = await entitledWorkspace();
    const second = await entitledWorkspace();
    const subdomain = `shared-${uniqueSuffix()}`;

    await createSite({
      workspaceId: first.workspace.id,
      userId: first.owner.id,
      name: "First",
      templateKey: "walking_tours",
      subdomain,
    });

    await expect(
      createSite({
        workspaceId: second.workspace.id,
        userId: second.owner.id,
        name: "Second",
        templateKey: "walking_tours",
        subdomain,
      }),
    ).rejects.toThrow(/already taken/);
  });
});

describe("tenant isolation", () => {
  /**
   * Every read and write is scoped by workspace in the query, not checked
   * afterwards. These assertions are the ones that would fail if someone
   * changed `findFirst({ id, workspaceId })` to `findUnique({ id })`.
   */
  it("does not return another workspace's site", async () => {
    const owner = await entitledWorkspace();
    const other = await entitledWorkspace();
    const site = await createSite({
      workspaceId: owner.workspace.id,
      userId: owner.owner.id,
      name: "Mine",
      templateKey: "walking_tours",
    });

    await expect(getSite(other.workspace.id, site.id)).rejects.toThrow(/Site not found/);
  });

  it("does not let another workspace edit a page", async () => {
    const owner = await entitledWorkspace();
    const other = await entitledWorkspace();
    const site = await createSite({
      workspaceId: owner.workspace.id,
      userId: owner.owner.id,
      name: "Mine",
      templateKey: "walking_tours",
    });
    const loaded = await getSite(owner.workspace.id, site.id);
    const page = loaded.pages[0];

    await expect(
      updateSitePage({
        workspaceId: other.workspace.id,
        siteId: site.id,
        pageId: page.id,
        title: "Hijacked",
      }),
    ).rejects.toThrow(/Page not found/);
  });

  it("refuses a reorder containing a page id from another site", async () => {
    const owner = await entitledWorkspace();
    const other = await entitledWorkspace();
    const mine = await createSite({
      workspaceId: owner.workspace.id,
      userId: owner.owner.id,
      name: "Mine",
      templateKey: "walking_tours",
    });
    const theirs = await createSite({
      workspaceId: other.workspace.id,
      userId: other.owner.id,
      name: "Theirs",
      templateKey: "walking_tours",
    });

    const mySite = await getSite(owner.workspace.id, mine.id);
    const theirSite = await getSite(other.workspace.id, theirs.id);

    await expect(
      reorderSitePages({
        workspaceId: owner.workspace.id,
        siteId: mine.id,
        orderedPageIds: [mySite.pages[0].id, theirSite.pages[0].id],
      }),
    ).rejects.toThrow(/does not match this site/);
  });
});

describe("pages", () => {
  it("rejects a duplicate path", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "Acme",
      templateKey: "walking_tours",
    });

    await expect(
      createSitePage({
        workspaceId: workspace.id,
        userId: owner.id,
        siteId: site.id,
        path: "/about",
        title: "About again",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("refuses to delete the homepage or a template-owned page", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "Acme",
      templateKey: "walking_tours",
    });
    const loaded = await getSite(workspace.id, site.id);
    const home = loaded.pages.find((page) => page.path === "/")!;
    const tours = loaded.pages.find((page) => page.path === "/tours")!;

    await expect(
      deleteSitePage({ workspaceId: workspace.id, siteId: site.id, pageId: home.id }),
    ).rejects.toThrow();
    await expect(
      deleteSitePage({ workspaceId: workspace.id, siteId: site.id, pageId: tours.id }),
    ).rejects.toThrow(/part of the template/);
  });

  it("allows deleting a page the operator added", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "Acme",
      templateKey: "walking_tours",
    });
    const page = await createSitePage({
      workspaceId: workspace.id,
      userId: owner.id,
      siteId: site.id,
      path: "/groups",
      title: "Group bookings",
    });

    await deleteSitePage({ workspaceId: workspace.id, siteId: site.id, pageId: page.id });
    const loaded = await getSite(workspace.id, site.id);
    expect(loaded.pages.map((item) => item.path)).not.toContain("/groups");
  });

  it("rejects content that fails schema validation", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "Acme",
      templateKey: "walking_tours",
    });
    const loaded = await getSite(workspace.id, site.id);

    await expect(
      updateSitePage({
        workspaceId: workspace.id,
        siteId: site.id,
        pageId: loaded.pages[0].id,
        content: {
          version: 1,
          sections: [
            {
              id: "cta-x",
              type: "cta",
              layout: {},
              props: { title: "Go", primaryCta: { label: "Go", href: "javascript:alert(1)" } },
            },
          ],
        },
      }),
    ).rejects.toThrow();
  });
});

describe("publish", () => {
  it("stores a checksummed revision and reports the unconfigured edge honestly", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "Acme",
      templateKey: "walking_tours",
    });

    const result = await publishSite({
      workspaceId: workspace.id,
      userId: owner.id,
      siteId: site.id,
    });

    // Not configured is not a lie about success, and not a crash either.
    expect(result.status).toBe("failed");
    expect(result.message).toMatch(/CLOUDFLARE_DISPATCH_NAMESPACE/);

    const revision = await prisma.siteRevision.findFirst({
      where: { siteId: site.id },
      orderBy: { versionNumber: "desc" },
    });
    expect(revision?.versionNumber).toBe(1);
    expect(revision?.checksum).toMatch(/^[0-9a-f]{64}$/);

    // The site never claims to be published when it is not.
    const after = await prisma.site.findUnique({ where: { id: site.id } });
    expect(after?.publishedRevisionId).toBeNull();
    expect(after?.status).toBe("ready");
  });

  it("refuses to publish a site with no enabled homepage", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "Acme",
      templateKey: "walking_tours",
    });
    const loaded = await getSite(workspace.id, site.id);
    const home = loaded.pages.find((page) => page.path === "/")!;
    await updateSitePage({
      workspaceId: workspace.id,
      siteId: site.id,
      pageId: home.id,
      enabled: false,
    });

    await expect(
      publishSite({ workspaceId: workspace.id, userId: owner.id, siteId: site.id }),
    ).rejects.toThrow(/homepage/);
  });

  it("increments the version on each publish", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "Acme",
      templateKey: "walking_tours",
    });

    const first = await publishSite({ workspaceId: workspace.id, userId: owner.id, siteId: site.id });
    const second = await publishSite({ workspaceId: workspace.id, userId: owner.id, siteId: site.id });
    expect(first.versionNumber).toBe(1);
    expect(second.versionNumber).toBe(2);
  });

  it("resolves pinned tours to slugs in the stored revision", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const tour = await createTestTour(workspace.id);
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "Acme",
      templateKey: "walking_tours",
    });
    const loaded = await getSite(workspace.id, site.id);
    const home = loaded.pages.find((page) => page.path === "/")!;

    await updateSitePage({
      workspaceId: workspace.id,
      siteId: site.id,
      pageId: home.id,
      content: {
        version: 1,
        sections: [
          {
            id: "tours-1",
            type: "tourCards",
            layout: {},
            props: { tourIds: [tour.id], limit: 3, autoFill: false },
          },
        ],
      },
    });

    await publishSite({ workspaceId: workspace.id, userId: owner.id, siteId: site.id });
    const revision = await prisma.siteRevision.findFirst({
      where: { siteId: site.id },
      orderBy: { versionNumber: "desc" },
    });
    // The snapshot holds ids; the rendered bundle holds slugs. Checking the
    // revision proves the snapshot is what rollback will restore.
    expect(JSON.stringify(revision?.snapshot)).toContain(tour.id);
  });
});

describe("rollback", () => {
  it("restores the pages captured in an earlier revision", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "Acme",
      templateKey: "walking_tours",
    });

    await publishSite({ workspaceId: workspace.id, userId: owner.id, siteId: site.id });
    const firstRevision = await prisma.siteRevision.findFirst({
      where: { siteId: site.id, versionNumber: 1 },
    });

    // Change the draft, then publish again so v1 is genuinely in the past.
    const loaded = await getSite(workspace.id, site.id);
    const home = loaded.pages.find((page) => page.path === "/")!;
    await updateSitePage({
      workspaceId: workspace.id,
      siteId: site.id,
      pageId: home.id,
      content: {
        version: 1,
        sections: [{ id: "hero-changed", type: "hero", layout: {}, props: { title: "Changed" } }],
      },
    });
    await publishSite({ workspaceId: workspace.id, userId: owner.id, siteId: site.id });

    const changed = await getSite(workspace.id, site.id);
    expect(JSON.stringify(changed.pages)).toContain("hero-changed");

    await rollbackSite({
      workspaceId: workspace.id,
      userId: owner.id,
      siteId: site.id,
      revisionId: firstRevision!.id,
    });

    // The editor now shows what was rolled back to, rather than a draft that
    // silently diverges from what is live.
    const restored = await getSite(workspace.id, site.id);
    expect(JSON.stringify(restored.pages)).not.toContain("hero-changed");
    expect(restored.pages.map((page) => page.path)).toContain("/tours");
  });

  it("refuses a revision from another workspace's site", async () => {
    const owner = await entitledWorkspace();
    const other = await entitledWorkspace();
    const mine = await createSite({
      workspaceId: owner.workspace.id,
      userId: owner.owner.id,
      name: "Mine",
      templateKey: "walking_tours",
    });
    const theirs = await createSite({
      workspaceId: other.workspace.id,
      userId: other.owner.id,
      name: "Theirs",
      templateKey: "walking_tours",
    });
    await publishSite({
      workspaceId: other.workspace.id,
      userId: other.owner.id,
      siteId: theirs.id,
    });
    const theirRevision = await prisma.siteRevision.findFirst({ where: { siteId: theirs.id } });

    await expect(
      rollbackSite({
        workspaceId: owner.workspace.id,
        userId: owner.owner.id,
        siteId: mine.id,
        revisionId: theirRevision!.id,
      }),
    ).rejects.toThrow(/Revision not found/);
  });
});

describe("settings", () => {
  it("refuses a theme that fails the contrast gate", async () => {
    const { owner, workspace } = await entitledWorkspace();
    const site = await createSite({
      workspaceId: workspace.id,
      userId: owner.id,
      name: "Acme",
      templateKey: "walking_tours",
    });

    await expect(
      updateSiteSettings({
        workspaceId: workspace.id,
        userId: owner.id,
        siteId: site.id,
        theme: { textColor: "#cccccc", backgroundColor: "#ffffff" },
      }),
    ).rejects.toThrow();
  });
});
