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

/** One owner + one active public tour + one future scheduled departure — the common baseline most booking tests need. */
export async function createBookableFixture(
  overrides: {
    tour?: Parameters<typeof createTestTour>[1];
    availability?: Parameters<typeof createTestAvailability>[1];
    workspace?: Parameters<typeof createTestWorkspace>[1];
  } = {},
) {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id, overrides.workspace);
  await addMember(workspace.id, owner.id, "workspace_owner");
  const tour = await createTestTour(workspace.id, overrides.tour);
  const availability = await createTestAvailability(tour, overrides.availability);
  return { owner, workspace, tour, availability };
}
