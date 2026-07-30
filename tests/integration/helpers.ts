import { config } from "dotenv";

config({ path: ".env.test" });

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, type Tour, type WorkspaceRole } from "@prisma/client";
import type Stripe from "stripe";

if (!process.env.DATABASE_URL?.includes("tripistic_test")) {
  throw new Error("Integration tests must run against tripistic_test — check .env.test");
}

/** Shared client for the whole integration run — same singleton pattern as `lib/db.ts`. */
export const prisma = new PrismaClient();

/** Short random id-safe suffix so every fixture is uniquely namespaced. */
export function uniqueSuffix(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function createTestUser(overrides: { name?: string; email?: string } = {}) {
  const suffix = uniqueSuffix();
  return prisma.user.create({
    data: {
      name: overrides.name ?? `Test User ${suffix}`,
      email: overrides.email ?? `test-${suffix}@example.com`,
      passwordHash: await bcrypt.hash("password123!", 4),
      emailVerifiedAt: new Date(),
    },
  });
}

export async function createTestWorkspace(
  ownerId: string,
  overrides: {
    name?: string;
    slug?: string;
    timezone?: string;
    currency?: string;
    status?: "active" | "suspended" | "archived";
  } = {},
) {
  const suffix = uniqueSuffix();
  return prisma.workspace.create({
    data: {
      name: overrides.name ?? `Test Workspace ${suffix}`,
      slug: overrides.slug ?? `test-ws-${suffix}`,
      ownerId,
      timezone: overrides.timezone ?? "America/Phoenix",
      currency: overrides.currency ?? "USD",
      status: overrides.status ?? "active",
    },
  });
}

export async function addMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole = "workspace_owner",
) {
  return prisma.workspaceMember.create({
    data: { workspaceId, userId, role, status: "active" },
  });
}

/**
 * An active plan + subscription for a workspace.
 *
 * `global-setup.ts` truncates every table — including `plans` — so the seed
 * that CI runs before the suite is gone by the time any test executes. A
 * workspace built by `createTestWorkspace` therefore has no subscription,
 * and every entitlement gate that calls `requireSubscription`
 * (`lib/plans/entitlements.ts`) rejects with 409. Production does not have
 * this shape: `POST /api/workspaces` attaches the default plan at creation
 * (`app/api/workspaces/route.ts`), so any route behind a seat, tour, or
 * domain limit needs this fixture to reach the behaviour under test.
 *
 * Limits default to values high enough not to be the thing under test —
 * pass `limits` explicitly when the limit itself is the assertion.
 */
export async function createTestSubscription(
  workspaceId: string,
  overrides: Partial<{
    limits: Record<string, number>;
    status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
    /**
     * Plan-level feature flags, written as `FeatureFlag` rows exactly as the
     * seed does. Omit to leave the plan with no rows at all, which exercises
     * the catalog fallback in `hasFeature`.
     */
    features: Record<string, boolean>;
    /** Catalog slug to impersonate, so the catalog fallback resolves. */
    slug: string;
  }> = {},
) {
  const suffix = uniqueSuffix();
  const limits = overrides.limits ?? { users: 25, active_tours: -1, custom_domains: 5 };

  // Two distinct shapes, because `Plan.slug` is globally unique:
  //
  //  - `slug` given: impersonate a catalog plan so `hasFeature`'s catalog
  //    fallback resolves. Plans are a global catalog rather than tenant data,
  //    so the row is shared across tests exactly as it is in production —
  //    upserted, so concurrent test files cannot race to create it.
  //  - `features` given: this test owns the plan's flag rows, so it needs a
  //    private plan nobody else will read.
  const plan = overrides.slug
    ? await prisma.plan.upsert({
        where: { slug: overrides.slug },
        update: {},
        create: {
          name: `Catalog Plan ${overrides.slug}`,
          slug: overrides.slug,
          priceMonthly: 0,
          priceYearly: 0,
          currency: "USD",
          limits,
        },
      })
    : await prisma.plan.create({
        data: {
          name: `Test Plan ${suffix}`,
          slug: `test-plan-${suffix}`,
          priceMonthly: 0,
          priceYearly: 0,
          currency: "USD",
          limits,
        },
      });

  if (overrides.features) {
    if (overrides.slug) {
      throw new Error(
        "createTestSubscription: pass `features` or `slug`, not both — a shared catalog plan's flag rows would leak between tests.",
      );
    }
    await prisma.featureFlag.createMany({
      data: Object.entries(overrides.features).map(([featureKey, enabled]) => ({
        planId: plan.id,
        featureKey,
        enabled,
      })),
    });
  }

  return prisma.subscription.create({
    data: { workspaceId, planId: plan.id, status: overrides.status ?? "active" },
  });
}

/**
 * Puts a workspace on the top catalog plan, so every gated feature resolves.
 *
 * Phase 8 made feature entitlement a server-side check, which means a test
 * exercising CRM, vehicles, itineraries, operations, guides, vendors, waivers
 * or advanced AI now needs its workspace to actually be entitled to it —
 * otherwise the route correctly answers 402 and the test is measuring the gate
 * instead of the feature.
 *
 * `enterprise` rather than a bespoke plan so the entitlement comes from the
 * same catalog production reads, and a future flag added to the catalog is
 * picked up here automatically.
 */
export async function entitleWorkspace(workspaceId: string) {
  return createTestSubscription(workspaceId, { slug: "enterprise" });
}

/** Turns a feature on or off for one workspace, overriding its plan. */
export async function setWorkspaceFeature(
  workspaceId: string,
  featureKey: string,
  enabled: boolean,
) {
  return prisma.featureFlag.create({ data: { workspaceId, featureKey, enabled } });
}

/**
 * A Stripe Connect account in the charge-ready state.
 *
 * `createCheckoutSessionForBooking` calls `getChargeReadyPaymentAccount`
 * before it creates a session (`lib/payments/service.ts`), which rejects
 * with 409 unless the workspace has an `enabled` account with both charges
 * and payouts on (`lib/payments/connect.ts`). Any test that expects a paid
 * booking to reach Stripe needs this; omit it to exercise the blocked path.
 */
export async function createTestPaymentAccount(
  workspaceId: string,
  overrides: Partial<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    status: "onboarding" | "restricted" | "enabled" | "disabled";
    platformFeeBps: number;
    defaultCurrency: string;
  }> = {},
) {
  return prisma.workspacePaymentAccount.create({
    data: {
      workspaceId,
      providerAccountId: `acct_test_${uniqueSuffix()}`,
      status: overrides.status ?? "enabled",
      chargesEnabled: overrides.chargesEnabled ?? true,
      payoutsEnabled: overrides.payoutsEnabled ?? true,
      detailsSubmitted: true,
      platformFeeBps: overrides.platformFeeBps ?? 0,
      defaultCurrency: overrides.defaultCurrency ?? "usd",
      country: "US",
    },
  });
}

export async function createTestTour(
  workspaceId: string,
  overrides: Partial<{
    title: string;
    slug: string;
    capacity: number;
    basePrice: number;
    currency: string;
    status: "draft" | "active" | "archived";
    visibility: "public" | "private";
    durationMinutes: number;
    waiverRequired: boolean;
  }> = {},
) {
  const suffix = uniqueSuffix();
  return prisma.tour.create({
    data: {
      workspaceId,
      title: overrides.title ?? `Test Tour ${suffix}`,
      slug: overrides.slug ?? `test-tour-${suffix}`,
      durationMinutes: overrides.durationMinutes ?? 120,
      capacity: overrides.capacity ?? 10,
      basePrice: overrides.basePrice ?? 5000,
      currency: overrides.currency ?? "USD",
      status: overrides.status ?? "active",
      visibility: overrides.visibility ?? "public",
      waiverRequired: overrides.waiverRequired ?? false,
    },
  });
}

export async function createTestAvailability(
  tour: Tour,
  overrides: Partial<{
    startsAt: Date;
    capacity: number;
    priceOverride: number | null;
    status: "scheduled" | "cancelled";
    bookedCount: number;
  }> = {},
) {
  const startsAt = overrides.startsAt ?? new Date(Date.now() + 7 * 86_400_000);
  return prisma.availability.create({
    data: {
      workspaceId: tour.workspaceId,
      tourId: tour.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + tour.durationMinutes * 60_000),
      capacity: overrides.capacity ?? tour.capacity,
      priceOverride: overrides.priceOverride ?? null,
      status: overrides.status ?? "scheduled",
      bookedCount: overrides.bookedCount ?? 0,
    },
  });
}

/**
 * A hand-built `Stripe.Event`-shaped object for tests that exercise
 * `processStripeWebhookEvent` directly, without a real Stripe API call —
 * only the fields the webhook service and its tests actually read are
 * populated; the rest of the real `Stripe.Event` interface is irrelevant
 * for that code path.
 */
export function fakeStripeEvent(type: string, object: Record<string, unknown>, id?: string): Stripe.Event {
  return {
    id: id ?? `evt_test_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    object: "event",
    type,
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    data: { object },
  } as unknown as Stripe.Event;
}

/**
 * One owner + one active public tour + one future scheduled departure — the
 * common baseline most booking tests need.
 *
 * Set `paymentAccount: true` when the test drives a *paid* booking all the
 * way to a Checkout Session; without it `getChargeReadyPaymentAccount`
 * rejects with 409 before Stripe is reached. Left off by default so the
 * not-yet-onboarded path stays assertable.
 */
export async function createBookableFixture(
  overrides: {
    tour?: Parameters<typeof createTestTour>[1];
    availability?: Parameters<typeof createTestAvailability>[1];
    workspace?: Parameters<typeof createTestWorkspace>[1];
    paymentAccount?: boolean | Parameters<typeof createTestPaymentAccount>[1];
    /** Set false to exercise a workspace with no entitled subscription. */
    subscription?: false;
  } = {},
) {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id, overrides.workspace);
  await addMember(workspace.id, owner.id, "workspace_owner");
  // Every workspace created through the product gets a trial subscription
  // (app/api/workspaces/route.ts), and Phase 8 made feature access depend on
  // having one. Entitling here keeps this fixture matching production rather
  // than leaving tests to discover a 402 from an unrelated gate.
  // Opt out with `subscription: false` where the absence is the point.
  if (overrides.subscription !== false) {
    await entitleWorkspace(workspace.id);
  }
  const tour = await createTestTour(workspace.id, overrides.tour);
  const availability = await createTestAvailability(tour, overrides.availability);
  if (overrides.paymentAccount) {
    await createTestPaymentAccount(
      workspace.id,
      typeof overrides.paymentAccount === "boolean" ? undefined : overrides.paymentAccount,
    );
  }
  return { owner, workspace, tour, availability };
}
