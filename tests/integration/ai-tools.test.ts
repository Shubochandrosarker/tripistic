import { describe, expect, it } from "vitest";

import { invokeTool, toolsForSurface, AI_TOOLS, findTool } from "@/lib/ai/tools";
import { clearMemoryVectorStore } from "@/lib/ai/rag/store";
import { indexSource } from "@/lib/ai/rag/indexer";

import {
  addMember,
  createTestTour,
  createTestUser,
  createTestWorkspace,
  entitleWorkspace,
  uniqueSuffix,
} from "./helpers";

/**
 * Tool authorization.
 *
 * The property under test throughout: **a tool call is authorised by the
 * caller's verified session, never by the conversation.** That is what makes a
 * successful prompt injection unable to reach data the user could not reach
 * themselves, so every test here approaches it from a different angle — wrong
 * workspace, wrong role, no session, invalid arguments.
 */

async function authedWorkspace() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  // `requireWorkspaceAccess` resolves membership rows, not `Workspace.ownerId`
  // — the owner needs an actual membership, exactly as registration creates.
  await addMember(workspace.id, owner.id, "workspace_owner");
  await entitleWorkspace(workspace.id);
  return { owner, workspace };
}

function contextFor(userId: string, workspaceId: string | null) {
  return { userId, workspaceId, isAuthenticated: true };
}

describe("tool registry", () => {
  it("offers only public-safe tools to an unauthenticated surface", () => {
    const publicTools = toolsForSurface(false);
    expect(publicTools.length).toBeGreaterThan(0);
    expect(publicTools.every((tool) => tool.publicSafe)).toBe(true);
    expect(publicTools.map((tool) => tool.name)).not.toContain("getBookings");
  });

  /**
   * Publishing, cancelling, refunding, changing a subscription and removing a
   * domain have no tool at all. That is the implementation of "the LLM cannot
   * bypass confirmation" — not a flag it could be talked past.
   */
  it("exposes no tool for a strong-confirm action", () => {
    const names = AI_TOOLS.map((tool) => tool.name.toLowerCase());
    for (const forbidden of ["publish", "cancelbooking", "refund", "deletedomain", "changeplan"]) {
      expect(names.some((name) => name.includes(forbidden))).toBe(false);
    }
    expect(AI_TOOLS.every((tool) => tool.risk !== "strong_confirm")).toBe(true);
  });

  it("takes no workspaceId argument on any tool", () => {
    for (const tool of AI_TOOLS) {
      const keys = Object.keys((tool.input as { shape?: object }).shape ?? {});
      expect(keys).not.toContain("workspaceId");
      expect(keys).not.toContain("userId");
    }
  });
});

describe("invokeTool", () => {
  it("returns a typed error for an unknown tool rather than throwing", async () => {
    const result = await invokeTool("dropAllTables", {}, contextFor("u", "w"));
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects invalid arguments before the tool body runs", async () => {
    const { owner, workspace } = await authedWorkspace();
    const result = await invokeTool(
      "getAvailability",
      { tourId: "", limit: 999 },
      contextFor(owner.id, workspace.id),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("refuses a workspace tool with no authenticated session", async () => {
    const result = await invokeTool(
      "searchTours",
      {},
      { userId: "u", workspaceId: null, isAuthenticated: false },
    );
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  /**
   * The core cross-tenant case. A model that was persuaded to ask about
   * another workspace still gets nothing, because membership is re-checked
   * against the database on every call.
   */
  it("refuses a workspace the caller is not a member of", async () => {
    const mine = await authedWorkspace();
    const theirs = await authedWorkspace();

    const result = await invokeTool(
      "searchTours",
      {},
      contextFor(mine.owner.id, theirs.workspace.id),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("returns only the caller's own tours", async () => {
    const mine = await authedWorkspace();
    const theirs = await authedWorkspace();
    const suffix = uniqueSuffix();
    await createTestTour(mine.workspace.id, { title: `Mine ${suffix}` });
    await createTestTour(theirs.workspace.id, { title: `Theirs ${suffix}` });

    const result = await invokeTool(
      "searchTours",
      { query: suffix },
      contextFor(mine.owner.id, mine.workspace.id),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const titles = (result.result as Array<{ title: string }>).map((tour) => tour.title);
      expect(titles).toEqual([`Mine ${suffix}`]);
    }
  });

  it("does not return another workspace's departures for a borrowed tour id", async () => {
    const mine = await authedWorkspace();
    const theirs = await authedWorkspace();
    const theirTour = await createTestTour(theirs.workspace.id);

    const result = await invokeTool(
      "getAvailability",
      { tourId: theirTour.id },
      contextFor(mine.owner.id, mine.workspace.id),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result).toEqual([]);
  });

  describe("role checks", () => {
    it("refuses billing information to a non-admin member", async () => {
      const { owner, workspace } = await authedWorkspace();
      const staff = await createTestUser();
      await addMember(workspace.id, staff.id, "staff");

      const result = await invokeTool(
        "getSubscriptionAndUsage",
        {},
        contextFor(staff.id, workspace.id),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);

      const asOwner = await invokeTool(
        "getSubscriptionAndUsage",
        {},
        contextFor(owner.id, workspace.id),
      );
      expect(asOwner.ok).toBe(true);
    });

    it("refuses domains to a viewer", async () => {
      const { workspace } = await authedWorkspace();
      const viewer = await createTestUser();
      await addMember(workspace.id, viewer.id, "viewer");

      const result = await invokeTool("getDomains", {}, contextFor(viewer.id, workspace.id));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });

    it("refuses booking data to a guide", async () => {
      const { workspace } = await authedWorkspace();
      const guide = await createTestUser();
      await addMember(workspace.id, guide.id, "guide");

      const result = await invokeTool("getBookings", {}, contextFor(guide.id, workspace.id));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(403);
    });
  });

  describe("write tools", () => {
    it("returns a proposal that requires confirmation, not a mutation", async () => {
      const { owner, workspace } = await authedWorkspace();
      const tour = await createTestTour(workspace.id, { title: "Original title" });

      const result = await invokeTool(
        "proposeTourCopy",
        { tourId: tour.id },
        contextFor(owner.id, workspace.id),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.risk).toBe("confirm");
        expect(result.result).toMatchObject({ requiresConfirmation: true });
      }

      // Nothing was written.
      const { prisma } = await import("@/lib/db");
      const after = await prisma.tour.findUnique({ where: { id: tour.id } });
      expect(after?.title).toBe("Original title");
    });

    it("refuses a tour from another workspace", async () => {
      const mine = await authedWorkspace();
      const theirs = await authedWorkspace();
      const theirTour = await createTestTour(theirs.workspace.id);

      const result = await invokeTool(
        "proposeTourCopy",
        { tourId: theirTour.id },
        contextFor(mine.owner.id, mine.workspace.id),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(404);
    });
  });

  describe("searchKnowledge", () => {
    it("searches only the caller's workspace when authenticated", async () => {
      clearMemoryVectorStore();
      const mine = await authedWorkspace();
      const theirs = await authedWorkspace();

      await indexSource({
        scope: "private",
        workspaceId: theirs.workspace.id,
        sourceType: "operator_faq",
        sourceId: `faq-${uniqueSuffix()}`,
        title: "Secret",
        body: "Notes\n\nOur secret meeting point is Alpha Pier.",
      });

      const result = await invokeTool(
        "searchKnowledge",
        { query: "meeting point" },
        contextFor(mine.owner.id, mine.workspace.id),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(JSON.stringify(result.result)).not.toContain("Alpha Pier");
      clearMemoryVectorStore();
    });

    it("is available to an anonymous caller and reaches no private content", async () => {
      clearMemoryVectorStore();
      const theirs = await authedWorkspace();
      await indexSource({
        scope: "private",
        workspaceId: theirs.workspace.id,
        sourceType: "operator_faq",
        sourceId: `faq-${uniqueSuffix()}`,
        title: "Secret",
        body: "Notes\n\nOur secret meeting point is Alpha Pier.",
      });

      const result = await invokeTool(
        "searchKnowledge",
        { query: "meeting point" },
        { userId: "anonymous", workspaceId: null, isAuthenticated: false },
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(JSON.stringify(result.result)).not.toContain("Alpha Pier");
      clearMemoryVectorStore();
    });
  });

  it("keeps guest PII out of booking tool results", async () => {
    const { owner, workspace } = await authedWorkspace();
    const result = await invokeTool("getBookings", {}, contextFor(owner.id, workspace.id));
    expect(result.ok).toBe(true);

    // Asserted on the select, because an empty result would pass trivially.
    const definition = findTool("getBookings");
    expect(definition).toBeDefined();
    const source = definition!.run.toString();
    expect(source).not.toContain("guestEmail");
    expect(source).not.toContain("guestPhone");
  });
});
