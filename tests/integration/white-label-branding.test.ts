import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { publicBrandingForSlug } from "@/lib/storefront/branding";
import { publishStorefront, saveStorefrontDraft } from "@/lib/storefront/service";
import { defaultStorefrontDraft } from "@/lib/storefront/schema";
import {
  addMember,
  createTestSubscription,
  createTestUser,
  createTestWorkspace,
  prisma,
  setWorkspaceFeature,
} from "./helpers";

/**
 * Phase 9 — white-label storefronts.
 *
 * The defect: an operator configured their brand name, logo and colours in the
 * storefront builder, and every one of those was applied *inside* the
 * storefront body only. The chrome around it — the header on their own custom
 * domain, the footer, the tour page, checkout, and the confirmation a guest
 * lands on after paying — rendered a Tripistic logo, the word "Tripistic", and
 * "Powered by Tripistic".
 *
 * A paying customer who had pointed their own domain at us showed their guests
 * a page branded by their software vendor. White-label means the vendor is not
 * visible; it was visible on every page.
 */

async function operatorWorkspace(slug: string) {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  await addMember(workspace.id, owner.id, "workspace_owner");
  await createTestSubscription(workspace.id, { slug });
  return { owner, workspace };
}

async function publishBrand(
  workspaceId: string,
  ownerId: string,
  workspace: { name: string; currency: string },
  brand: Partial<{ brandName: string; logoUrl: string; primaryColor: string }>,
) {
  const draft = defaultStorefrontDraft(workspace);
  await saveStorefrontDraft({
    workspaceId,
    userId: ownerId,
    input: { ...draft, brand: { ...draft.brand, ...brand } },
  });
  await publishStorefront({ workspaceId, userId: ownerId });
}

describe("branding resolves from the operator's published storefront", () => {
  it("uses their brand name and logo, not Tripistic's", async () => {
    const { owner, workspace } = await operatorWorkspace("agency");
    await publishBrand(workspace.id, owner.id, workspace, {
      brandName: "Kestrel Expeditions",
      logoUrl: "https://cdn.example.com/kestrel.png",
      primaryColor: "#123456",
    });

    const branding = await publicBrandingForSlug(workspace.slug);
    expect(branding?.brandName).toBe("Kestrel Expeditions");
    expect(branding?.logoUrl).toBe("https://cdn.example.com/kestrel.png");
    expect(branding?.primaryColor).toBe("#123456");
  });

  it("falls back to the workspace name before anything is published", async () => {
    // A storefront that has never been published still must not show the
    // vendor's name on the operator's own domain.
    const { workspace } = await operatorWorkspace("agency");
    const branding = await publicBrandingForSlug(workspace.slug);
    expect(branding?.brandName).toBe(workspace.name);
    expect(branding?.brandName).not.toBe("Tripistic");
  });

  it("returns null for an unknown slug so no other tenant's brand can leak", async () => {
    expect(await publicBrandingForSlug(`no-such-workspace-${randomUUID()}`)).toBeNull();
  });

  it("returns null for an archived workspace", async () => {
    const { workspace } = await operatorWorkspace("agency");
    await prisma.workspace.update({ where: { id: workspace.id }, data: { status: "archived" } });
    expect(await publicBrandingForSlug(workspace.slug)).toBeNull();
  });

  it("keeps two operators' brands separate", async () => {
    const a = await operatorWorkspace("agency");
    const b = await operatorWorkspace("agency");
    await publishBrand(a.workspace.id, a.owner.id, a.workspace, { brandName: "Alpha Tours" });
    await publishBrand(b.workspace.id, b.owner.id, b.workspace, { brandName: "Beta Travel" });

    expect((await publicBrandingForSlug(a.workspace.slug))?.brandName).toBe("Alpha Tours");
    expect((await publicBrandingForSlug(b.workspace.slug))?.brandName).toBe("Beta Travel");
  });
});

describe("platform attribution follows the white_label entitlement", () => {
  it("hides 'Powered by Tripistic' for a plan that includes white-label", async () => {
    const { workspace } = await operatorWorkspace("agency");
    const branding = await publicBrandingForSlug(workspace.slug);
    // This is the commercial substance of the feature: what the operator is
    // paying for is that their vendor is not named on their own pages.
    expect(branding?.showPlatformAttribution).toBe(false);
  });

  it("shows it when the entitlement is revoked for that workspace", async () => {
    const { workspace } = await operatorWorkspace("agency");
    await setWorkspaceFeature(workspace.id, "white_label", false);
    expect((await publicBrandingForSlug(workspace.slug))?.showPlatformAttribution).toBe(true);
  });

  it("shows it for a workspace with no entitled subscription", async () => {
    // Denied rather than granted when entitlement cannot be established —
    // the safe direction for a paid feature.
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    expect((await publicBrandingForSlug(workspace.slug))?.showPlatformAttribution).toBe(true);
  });

  it("is decided server-side, not from a storefront setting", async () => {
    // An operator on a plan without white-label must not be able to remove the
    // attribution by editing their own storefront: nothing in the draft schema
    // controls it, and the resolved value comes from the entitlement.
    const { owner, workspace } = await operatorWorkspace("solo-no-white-label");
    await setWorkspaceFeature(workspace.id, "white_label", false);
    await publishBrand(workspace.id, owner.id, workspace, { brandName: "Sneaky Tours" });

    const branding = await publicBrandingForSlug(workspace.slug);
    expect(branding?.brandName).toBe("Sneaky Tours");
    expect(branding?.showPlatformAttribution).toBe(true);
  });
});

describe("the brand palette covers the whole guest journey", () => {
  it("exposes every colour the shell needs", async () => {
    // The colours are applied on the layout wrapper rather than inside the
    // storefront body, so the tour page, booking form and confirmation
    // inherit them. A guest who sees the operator's colours on the landing
    // page and the vendor's at checkout has not been shown a white-labelled
    // product.
    const { owner, workspace } = await operatorWorkspace("agency");
    await publishBrand(workspace.id, owner.id, workspace, { primaryColor: "#abcdef" });

    const branding = await publicBrandingForSlug(workspace.slug);
    expect(branding).toMatchObject({
      primaryColor: "#abcdef",
      secondaryColor: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      accentColor: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      surfaceColor: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      textColor: expect.stringMatching(/^#[0-9a-f]{6}$/i),
    });
  });
});
