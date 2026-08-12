import { describe, expect, it } from "vitest";

import { hasFeature } from "@/lib/plans/entitlements";
import { isFeatureEnabled } from "@/lib/plans/limits";
import { assertCredits, usageSnapshot } from "@/lib/ai/usage";

import {
  createTestSubscription,
  createTestUser,
  createTestWorkspace,
  prisma,
} from "./helpers";

/**
 * Temporary feature overrides.
 *
 * The promise being tested is narrow and easy to get wrong: **a grant with an
 * end date actually ends.** An override that outlives its `expiresAt` is not a
 * cosmetic bug — it is a paid feature given away indefinitely, discovered only
 * when someone asks why a customer has a tier they never bought.
 */

/**
 * A workspace on the cheapest catalogue plan.
 *
 * `guide_scheduling` is the feature under test throughout. Two reasons: `solo`
 * does not include it — an override on a feature the plan already grants would
 * pass every assertion here while proving nothing — and it is one of the keys
 * both `hasFeature` and the older `isFeatureEnabled` accept, so the two
 * resolvers can be compared directly.
 */
const WITHHELD_FEATURE = "guide_scheduling" as const;

async function soloWorkspace() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  await createTestSubscription(workspace.id, { slug: "solo" });
  return { owner, workspace };
}

function override(workspaceId: string, featureKey: string, expiresAt: Date | null, enabled = true) {
  return prisma.featureFlag.create({
    data: { workspaceId, featureKey, enabled, expiresAt, reason: "test grant" },
  });
}

describe("temporary grants", () => {
  it("does not include the feature before any override", async () => {
    const { workspace } = await soloWorkspace();
    expect(await hasFeature(workspace.id, WITHHELD_FEATURE)).toBe(false);
  });

  it("grants a feature the plan does not include", async () => {
    const { workspace } = await soloWorkspace();
    await override(workspace.id, WITHHELD_FEATURE, new Date(Date.now() + 86_400_000));
    expect(await hasFeature(workspace.id, WITHHELD_FEATURE)).toBe(true);
  });

  /**
   * The one that matters. An expired row must be invisible to resolution, so
   * the workspace falls back to its plan with nothing to clean up.
   */
  it("stops granting once the override has expired", async () => {
    const { workspace } = await soloWorkspace();
    await override(workspace.id, WITHHELD_FEATURE, new Date(Date.now() - 1_000));
    expect(await hasFeature(workspace.id, WITHHELD_FEATURE)).toBe(false);
  });

  it("keeps a permanent override applying", async () => {
    const { workspace } = await soloWorkspace();
    await override(workspace.id, WITHHELD_FEATURE, null);
    expect(await hasFeature(workspace.id, WITHHELD_FEATURE)).toBe(true);
  });

  /**
   * A kill switch has to keep working after the grant window it was paired
   * with. An expired *deny* falling back to "the plan says yes" is how an
   * abusive workspace quietly regains a feature support turned off.
   */
  it("honours a deny override while it is live and releases it when it expires", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await createTestSubscription(workspace.id, { slug: "enterprise" });

    expect(await hasFeature(workspace.id, "ai_copilot")).toBe(true);

    const denial = await override(workspace.id, "ai_copilot", new Date(Date.now() + 86_400_000), false);
    expect(await hasFeature(workspace.id, "ai_copilot")).toBe(false);

    await prisma.featureFlag.update({
      where: { id: denial.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await hasFeature(workspace.id, "ai_copilot")).toBe(true);
  });

  /**
   * `hasFeature` and `isFeatureEnabled` are two resolvers over the same rows.
   * If they disagree about expiry, a feature is on in one code path and off in
   * another — the hardest class of entitlement bug to reproduce.
   */
  it("resolves expiry identically in both feature resolvers", async () => {
    const { workspace } = await soloWorkspace();
    const live = await override(workspace.id, WITHHELD_FEATURE, new Date(Date.now() + 86_400_000));

    expect(await hasFeature(workspace.id, WITHHELD_FEATURE)).toBe(true);
    expect(await isFeatureEnabled(workspace.id, WITHHELD_FEATURE)).toBe(true);

    await prisma.featureFlag.update({
      where: { id: live.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    expect(await hasFeature(workspace.id, WITHHELD_FEATURE)).toBe(false);
    expect(await isFeatureEnabled(workspace.id, WITHHELD_FEATURE)).toBe(false);
  });
});

describe("AI credit ceiling overrides", () => {
  async function exhaustedWorkspace() {
    const { workspace } = await soloWorkspace();
    const snapshot = await usageSnapshot(workspace.id);
    const limit = snapshot.limit ?? 0;
    if (limit > 0) {
      await prisma.usageMeter.create({
        data: {
          workspaceId: workspace.id,
          key: "ai_credits",
          used: limit,
          periodStart: snapshot.window.start,
          periodEnd: snapshot.window.end,
        },
      });
    }
    return { workspace, limit };
  }

  it("refuses a call once the monthly allowance is spent", async () => {
    const { workspace, limit } = await exhaustedWorkspace();
    if (limit <= 0) return;
    await expect(assertCredits(workspace.id, 1)).rejects.toThrow(/monthly AI credits/i);
  });

  it("lets a live override lift the ceiling", async () => {
    const { workspace, limit } = await exhaustedWorkspace();
    if (limit <= 0) return;
    await override(workspace.id, "ai_usage_override", new Date(Date.now() + 86_400_000));
    await expect(assertCredits(workspace.id, 1)).resolves.toBeTruthy();
  });

  /**
   * "Extra credits for the season" that never ends is an unmetered account.
   */
  it("re-applies the ceiling once the override expires", async () => {
    const { workspace, limit } = await exhaustedWorkspace();
    if (limit <= 0) return;
    await override(workspace.id, "ai_usage_override", new Date(Date.now() - 1_000));
    await expect(assertCredits(workspace.id, 1)).rejects.toThrow(/monthly AI credits/i);
  });
});
