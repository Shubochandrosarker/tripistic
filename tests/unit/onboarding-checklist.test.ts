import { describe, expect, it } from "vitest";

import { buildOnboardingChecklist, onboardingProgress } from "@/lib/onboarding";

/**
 * Phase 11 — the setup checklist.
 *
 * Two of its seven items were hard-coded `done: false`:
 *
 *   - "Get paid out directly (Stripe Connect)", described as "a future
 *     upgrade" — while Stripe Connect was fully implemented, with onboarding
 *     links, account status, payout gating and balance all live. The product
 *     was telling operators a working feature did not exist.
 *   - "Open the Growth Insights dashboard", labelled "Phase 7" — an internal
 *     roadmap term shown to customers, on an item that could never be ticked.
 *
 * The result was a checklist that stopped at 5/7 no matter what an operator
 * did. A progress bar that cannot reach the end teaches people to ignore it.
 */

const NOTHING_DONE = {
  hasWorkspace: false,
  memberCount: 0,
  tourCount: 0,
  upcomingSlotCount: 0,
  hasPublicBookableTour: false,
  payoutsEnabled: false,
  hasFirstBooking: false,
};

const EVERYTHING_DONE = {
  hasWorkspace: true,
  memberCount: 2,
  tourCount: 3,
  upcomingSlotCount: 5,
  hasPublicBookableTour: true,
  payoutsEnabled: true,
  hasFirstBooking: true,
};

describe("the checklist can actually be completed", () => {
  it("reaches 100% when the operator has done everything", () => {
    const items = buildOnboardingChecklist(EVERYTHING_DONE);
    const progress = onboardingProgress(items);

    expect(progress.done).toBe(progress.total);
    expect(progress.percent).toBe(100);
  });

  it("starts at 0% for a brand-new account", () => {
    expect(onboardingProgress(buildOnboardingChecklist(NOTHING_DONE)).percent).toBe(0);
  });

  it("has no item that is impossible to complete", () => {
    // The actual regression: an item whose `done` ignores every input can
    // never be ticked, whatever the operator does.
    const none = buildOnboardingChecklist(NOTHING_DONE);
    const all = buildOnboardingChecklist(EVERYTHING_DONE);

    const stuck = all.filter((item, index) => !item.done && !none[index].done);
    expect(stuck.map((item) => item.key)).toEqual([]);
  });

  it("shows no unfinishable-step label, and no internal phase vocabulary", () => {
    // "Phase 7" means nothing to a tour operator; it is our roadmap leaking
    // into their product.
    for (const item of buildOnboardingChecklist(EVERYTHING_DONE)) {
      expect(item.phase, `${item.key} still carries a phase label`).toBeUndefined();
    }
    const serialized = JSON.stringify(buildOnboardingChecklist(NOTHING_DONE));
    expect(serialized).not.toMatch(/Phase \d/);
  });
});

describe("individual steps track real state", () => {
  it("ticks Stripe payouts only once payouts are actually enabled", () => {
    const off = buildOnboardingChecklist({ ...NOTHING_DONE, payoutsEnabled: false });
    const on = buildOnboardingChecklist({ ...NOTHING_DONE, payoutsEnabled: true });

    expect(off.find((i) => i.key === "stripe_payouts")?.done).toBe(false);
    expect(on.find((i) => i.key === "stripe_payouts")?.done).toBe(true);
  });

  it("no longer describes Stripe Connect as unavailable", () => {
    const item = buildOnboardingChecklist(NOTHING_DONE).find((i) => i.key === "stripe_payouts");
    expect(item?.description).not.toMatch(/future upgrade/i);
    expect(item?.description).toMatch(/payouts|paid out/i);
  });

  it("ticks the first booking only once one exists", () => {
    const before = buildOnboardingChecklist({ ...NOTHING_DONE, hasFirstBooking: false });
    const after = buildOnboardingChecklist({ ...NOTHING_DONE, hasFirstBooking: true });

    expect(before.find((i) => i.key === "first_booking")?.done).toBe(false);
    expect(after.find((i) => i.key === "first_booking")?.done).toBe(true);
  });

  it("ticks the team step only when someone else has joined", () => {
    // A workspace with one member is the owner alone, which is not an invite.
    expect(
      buildOnboardingChecklist({ ...NOTHING_DONE, memberCount: 1 }).find((i) => i.key === "invite_team")
        ?.done,
    ).toBe(false);
    expect(
      buildOnboardingChecklist({ ...NOTHING_DONE, memberCount: 2 }).find((i) => i.key === "invite_team")
        ?.done,
    ).toBe(true);
  });

  it("requires a bookable public tour, not merely a tour", () => {
    // Having created a tour is not the same as guests being able to book it,
    // and this is the step that decides whether the booking page works.
    const items = buildOnboardingChecklist({
      ...NOTHING_DONE,
      tourCount: 4,
      upcomingSlotCount: 2,
      hasPublicBookableTour: false,
    });
    expect(items.find((i) => i.key === "add_first_tour")?.done).toBe(true);
    expect(items.find((i) => i.key === "publish_booking_page")?.done).toBe(false);
  });
});

describe("every step is actionable", () => {
  it("points somewhere in the dashboard", () => {
    for (const item of buildOnboardingChecklist(NOTHING_DONE)) {
      expect(item.href, `${item.key} has no destination`).toMatch(/^\/dashboard/);
    }
  });

  it("has unique keys, so progress cannot double-count", () => {
    const keys = buildOnboardingChecklist(NOTHING_DONE).map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
