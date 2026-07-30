import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { assertFeature, hasFeature } from "@/lib/plans/entitlements";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import {
  addMember,
  createTestSubscription,
  createTestUser,
  createTestWorkspace,
  prisma,
  setWorkspaceFeature,
} from "./helpers";

/**
 * Phase 8 — server-side plan entitlement.
 *
 * The catalog defined 22 feature flags across four tiers and nothing on the
 * server checked any of them. The flags drove pricing copy and which nav links
 * rendered; a Solo customer who typed the URL had working access to CRM,
 * operations dispatch, vehicles, suppliers, itineraries, guide scheduling,
 * advanced AI and audit logs — every paid tier's differentiator.
 */

/**
 * `createTestWorkspace` records an owner on the workspace but does not create
 * the membership row, so the owner must be added explicitly — otherwise
 * `requireWorkspaceAccess` correctly 404s and every gate assertion below would
 * pass for the wrong reason.
 */
async function ownedWorkspace() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  await addMember(workspace.id, owner.id, "workspace_owner");
  return { owner, workspace };
}

async function workspaceOnOwnPlan(features: Record<string, boolean>) {
  const { owner, workspace } = await ownedWorkspace();
  await createTestSubscription(workspace.id, { features });
  return { owner, workspace };
}

async function workspaceOn(
  slug: string,
  status: "active" | "trialing" | "past_due" | "cancelled" | "expired" = "active",
) {
  const { owner, workspace } = await ownedWorkspace();
  await createTestSubscription(workspace.id, { slug, status });
  return { owner, workspace };
}

describe("hasFeature — resolution order", () => {
  it("grants a feature the plan's own rows enable", async () => {
    // No catalog slug: this plan owns its flag rows, so the DB row is what
    // resolves rather than the catalog fallback.
    const { workspace } = await workspaceOnOwnPlan({ crm_pipeline: true });
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(true);
  });

  it("denies a feature the plan's own rows disable", async () => {
    const { workspace } = await workspaceOnOwnPlan({ crm_pipeline: false });
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(false);
  });

  it("falls back to the catalog when the plan has no rows", async () => {
    // The important case. FeatureFlag rows come from the seed, so a deployment
    // whose seed had not run would otherwise resolve every flag to false and
    // turn a partial seed into a total feature outage for paying customers.
    const { workspace } = await workspaceOn("agency");
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(true);
    expect(await hasFeature(workspace.id, "itinerary_builder")).toBe(true);
  });

  it("falls back to the catalog for a cheaper plan too — and still denies", async () => {
    const { workspace } = await workspaceOn("solo");
    expect(await hasFeature(workspace.id, "booking_engine")).toBe(true);
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(false);
    expect(await hasFeature(workspace.id, "vehicles")).toBe(false);
  });

  it("denies an unknown plan slug rather than guessing", async () => {
    // A custom enterprise plan with no catalog entry gets nothing extra; the
    // safe direction when there is no definition to read.
    const { workspace } = await workspaceOn("bespoke-plan-with-no-catalog-entry");
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(false);
  });

  it("lets a workspace override beat the plan in both directions", async () => {
    const { workspace } = await workspaceOn("solo");
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(false);

    // Granting one tenant something their plan excludes — a sales concession.
    await setWorkspaceFeature(workspace.id, "crm_pipeline", true);
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(true);

    // And revoking something their plan includes — an emergency kill switch.
    const other = await workspaceOn("agency");
    await setWorkspaceFeature(other.workspace.id, "vehicles", false);
    expect(await hasFeature(other.workspace.id, "vehicles")).toBe(false);
  });
});

describe("hasFeature — subscription status", () => {
  it("entitles a workspace still in trial", async () => {
    // A trial that could not use the features it is trialling would be useless.
    const { workspace } = await workspaceOn("agency", "trialing");
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(true);
  });

  it("entitles a past-due workspace, which is what the grace period is for", async () => {
    const { workspace } = await workspaceOn("agency", "past_due");
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(true);
  });

  it("denies a cancelled workspace", async () => {
    const { workspace } = await workspaceOn("agency", "cancelled");
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(false);
  });

  it("denies a workspace with no subscription at all", async () => {
    const { workspace } = await ownedWorkspace();
    expect(await hasFeature(workspace.id, "crm_pipeline")).toBe(false);
  });
});

describe("assertFeature", () => {
  it("passes silently when entitled", async () => {
    const { workspace } = await workspaceOn("agency");
    await expect(assertFeature(workspace.id, "crm_pipeline")).resolves.toBeUndefined();
  });

  it("throws 402, not 403 — this is 'upgrade', not 'you may not'", async () => {
    const { workspace } = await workspaceOn("solo");
    // The distinction matters to the client, which should offer an upgrade
    // rather than render a permissions error the user cannot act on.
    await expect(assertFeature(workspace.id, "crm_pipeline")).rejects.toMatchObject({
      status: 402,
    });
  });

  it("names the feature in customer language, not by its flag key", async () => {
    const { workspace } = await workspaceOn("solo");
    try {
      await assertFeature(workspace.id, "operations_dispatch");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toContain("Operations dispatch");
      expect((error as ApiError).message).not.toContain("operations_dispatch");
    }
  });
});

describe("requireWorkspaceAccess with a feature gate", () => {
  it("returns the membership when the plan includes the feature", async () => {
    const { owner, workspace } = await workspaceOn("agency");
    const membership = await requireWorkspaceAccess(owner.id, workspace.id, {
      feature: "vehicles",
    });
    expect(membership.workspaceId).toBe(workspace.id);
  });

  it("refuses with 402 when the plan does not", async () => {
    const { owner, workspace } = await workspaceOn("solo");
    await expect(
      requireWorkspaceAccess(owner.id, workspace.id, { feature: "vehicles" }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it("still refuses a non-member with 404, never 402", async () => {
    // Ordering matters: answering "your plan does not include this" to someone
    // with no access would confirm the workspace exists.
    const { workspace } = await workspaceOn("solo");
    const outsider = await createTestUser();
    await expect(
      requireWorkspaceAccess(outsider.id, workspace.id, { feature: "vehicles" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("checks membership before entitlement even for an entitled workspace", async () => {
    const { workspace } = await workspaceOn("agency");
    const outsider = await createTestUser();
    await expect(
      requireWorkspaceAccess(outsider.id, workspace.id, { feature: "vehicles" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("is unaffected for callers that pass no feature", async () => {
    // The overwhelming majority of routes are ungated and must keep working.
    const { owner, workspace } = await workspaceOn("solo");
    const membership = await requireWorkspaceAccess(owner.id, workspace.id);
    expect(membership.workspaceId).toBe(workspace.id);
  });

  it("gates a member who is not the owner just the same", async () => {
    const { workspace } = await workspaceOn("solo");
    const staff = await createTestUser();
    await addMember(workspace.id, staff.id, "staff");
    await expect(
      requireWorkspaceAccess(staff.id, workspace.id, { feature: "crm_pipeline" }),
    ).rejects.toMatchObject({ status: 402 });
  });
});

describe("every paid differentiator is actually denied to Solo", () => {
  const SOLO_MUST_NOT_HAVE = [
    "crm_pipeline",
    "itinerary_builder",
    "operations_dispatch",
    "vehicles",
    "suppliers",
    "guide_scheduling",
    "advanced_ai",
    "audit_logs",
  ] as const;

  it.each(SOLO_MUST_NOT_HAVE)("denies %s", async (feature) => {
    const { workspace } = await workspaceOn("solo");
    expect(await hasFeature(workspace.id, feature)).toBe(false);
  });

  it("still grants Solo everything it does pay for", async () => {
    // The gate must not become a blanket denial — a Solo customer's own
    // product has to keep working.
    const { workspace } = await workspaceOn("solo");
    for (const feature of ["booking_engine", "stripe_payments", "digital_waivers", "white_label", "custom_domain"] as const) {
      expect(await hasFeature(workspace.id, feature), feature).toBe(true);
    }
  });
});

describe("feature flag rows do not leak across tenants", () => {
  it("keeps one workspace's override out of another's resolution", async () => {
    const a = await workspaceOn("solo");
    const b = await workspaceOn("solo");
    await setWorkspaceFeature(a.workspace.id, "vehicles", true);

    expect(await hasFeature(a.workspace.id, "vehicles")).toBe(true);
    expect(await hasFeature(b.workspace.id, "vehicles")).toBe(false);

    const rows = await prisma.featureFlag.count({
      where: { workspaceId: b.workspace.id, featureKey: "vehicles" },
    });
    expect(rows).toBe(0);
  });
});
