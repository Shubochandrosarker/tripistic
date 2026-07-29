import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the network-touching Stripe call (checkout.sessions.create) is
// mocked — toStripeAmount and every other export stay real. This sandbox
// has no real Stripe account, so a genuine network call would fail; the
// webhook signature-verification path (which needs no network access,
// pure HMAC) is exercised for real in payment-webhook.test.ts instead.
vi.mock("@/lib/payments/stripe-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/stripe-client")>(
    "@/lib/payments/stripe-client",
  );
  return { ...actual, getStripeClient: vi.fn() };
});

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { getStripeClient } from "@/lib/payments/stripe-client";
import { requireUserApi } from "@/lib/auth/session";
import { POST as publicCreateBookingRoute } from "@/app/api/public/[workspaceSlug]/bookings/route";
import { POST as paymentLinkRoute } from "@/app/api/workspaces/[id]/bookings/[bookingId]/payment-link/route";
import { GET as bookingDetailRoute } from "@/app/api/workspaces/[id]/bookings/[bookingId]/route";
import { GET as listBookingsRoute } from "@/app/api/workspaces/[id]/bookings/route";
import { createBooking } from "@/lib/bookings/service";
import {
  addMember,
  createBookableFixture,
  createTestPaymentAccount,
  createTestUser,
  createTestWorkspace,
  prisma,
} from "./helpers";

const mockGetStripeClient = getStripeClient as unknown as ReturnType<typeof vi.fn>;
const mockRequireUserApi = requireUserApi as unknown as ReturnType<typeof vi.fn>;

function fakeStripeClient() {
  const create = vi.fn().mockResolvedValue({
    id: `cs_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    url: "https://checkout.stripe.com/fake-session",
    payment_intent: `pi_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
  });
  return { checkout: { sessions: { create } } };
}

function asUser(user: { id: string }) {
  mockRequireUserApi.mockResolvedValue(user);
}

function req(url: string, init?: RequestInit) {
  return new Request(url, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStripeClient.mockReturnValue(fakeStripeClient());
});

function bookingPayload(availabilityId: string, overrides: Record<string, unknown> = {}) {
  return {
    availabilityId,
    participantCount: 1,
    participants: [{ firstName: "Pat", lastName: "Guest" }],
    guestFirstName: "Pat",
    guestLastName: "Guest",
    guestEmail: `guest-${randomUUID()}@example.com`,
    addons: [],
    termsAccepted: true,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

describe("public booking creation — payment gating", () => {
  it("a paid booking lands pending with a requires_payment Payment row and a checkout URL", async () => {
    const { workspace, availability } = await createBookableFixture({ tour: { basePrice: 5000, capacity: 5 }, paymentAccount: true });

    const res = await publicCreateBookingRoute(
      req(`http://x/api/public/${workspace.slug}/bookings`, {
        method: "POST",
        body: JSON.stringify(
          bookingPayload(availability.id, {
            participantCount: 2,
            participants: [
              { firstName: "A", lastName: "B" },
              { firstName: "C", lastName: "D" },
            ],
          }),
        ),
      }),
      { params: Promise.resolve({ workspaceSlug: workspace.slug }) },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      booking: { status: string };
      payment: { status: string; checkoutUrl: string | null; amount: number; currency: string } | null;
    };
    expect(body.booking.status).toBe("pending");
    expect(body.payment).not.toBeNull();
    expect(body.payment?.status).toBe("requires_payment");
    expect(body.payment?.amount).toBe(10000);
    expect(body.payment?.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

    const payments = await prisma.payment.findMany({ where: { workspaceId: workspace.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("requires_payment");
    expect(payments[0].providerCheckoutSessionId).toMatch(/^cs_test_/);
    expect(payments[0].providerPaymentIntentId).toMatch(/^pi_test_/);
    expect(payments[0].expiresAt).not.toBeNull();
  });

  it("a free booking (totalAmount 0) confirms immediately with no Payment row and no Stripe call", async () => {
    const { workspace, availability } = await createBookableFixture({ tour: { basePrice: 0, capacity: 5 } });

    const res = await publicCreateBookingRoute(
      req(`http://x/api/public/${workspace.slug}/bookings`, {
        method: "POST",
        body: JSON.stringify(bookingPayload(availability.id)),
      }),
      { params: Promise.resolve({ workspaceSlug: workspace.slug }) },
    );
    const body = (await res.json()) as { booking: { status: string }; payment: unknown };
    expect(body.booking.status).toBe("confirmed");
    expect(body.payment).toBeNull();
    expect(mockGetStripeClient).not.toHaveBeenCalled();

    const paymentCount = await prisma.payment.count({ where: { workspaceId: workspace.id } });
    expect(paymentCount).toBe(0);
  });

  it("an idempotent replay reuses the same Checkout Session instead of creating a second Payment row", async () => {
    const { workspace, availability } = await createBookableFixture({ tour: { basePrice: 3000, capacity: 5 }, paymentAccount: true });
    const payload = bookingPayload(availability.id);

    const first = await publicCreateBookingRoute(
      req(`http://x/api/public/${workspace.slug}/bookings`, { method: "POST", body: JSON.stringify(payload) }),
      { params: Promise.resolve({ workspaceSlug: workspace.slug }) },
    );
    expect(first.status).toBe(201);

    const second = await publicCreateBookingRoute(
      req(`http://x/api/public/${workspace.slug}/bookings`, { method: "POST", body: JSON.stringify(payload) }),
      { params: Promise.resolve({ workspaceSlug: workspace.slug }) },
    );
    expect(second.status).toBe(200);

    const payments = await prisma.payment.findMany({ where: { workspaceId: workspace.id } });
    expect(payments).toHaveLength(1); // not 2
    expect(mockGetStripeClient).toHaveBeenCalledTimes(1); // second call reused the cached session
  });
});

describe("manual booking payment links", () => {
  async function manualPendingBooking(role: "workspace_owner" | "viewer") {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const actor = role === "workspace_owner" ? owner : await createTestUser();
    if (role !== "workspace_owner") await addMember(workspace.id, actor.id, role);
    // The payment-link route goes through getChargeReadyPaymentAccount.
    await createTestPaymentAccount(workspace.id);

    const tour = await prisma.tour.create({
      data: {
        workspaceId: workspace.id,
        title: "Manual Tour",
        slug: `manual-${randomUUID().slice(0, 8)}`,
        durationMinutes: 60,
        capacity: 5,
        basePrice: 4000,
        status: "active",
        visibility: "private",
      },
    });
    const availability = await prisma.availability.create({
      data: {
        workspaceId: workspace.id,
        tourId: tour.id,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        capacity: 5,
      },
    });
    const { booking } = await createBooking({
      workspaceId: workspace.id,
      tourId: tour.id,
      availabilityId: availability.id,
      participantCount: 1,
      participants: [{ firstName: "Phone", lastName: "Guest" }],
      guestFirstName: "Phone",
      guestLastName: "Guest",
      guestEmail: "phone@example.com",
      addons: [],
      source: "manual",
      requirePublicVisibility: false,
      status: "pending",
      createdById: owner.id,
    });
    return { workspace, actor, booking };
  }

  it("generates a real payment link for a pending manual booking", async () => {
    const { workspace, actor, booking } = await manualPendingBooking("workspace_owner");
    asUser(actor);

    const res = await paymentLinkRoute(req("http://x/api", { method: "POST" }), {
      params: Promise.resolve({ id: workspace.id, bookingId: booking.id }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { checkoutUrl: string | null };
    expect(body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

    const payments = await prisma.payment.findMany({ where: { bookingId: booking.id } });
    expect(payments).toHaveLength(1);
  });

  it("viewer cannot generate a payment link (403)", async () => {
    const { workspace, actor, booking } = await manualPendingBooking("viewer");
    asUser(actor);

    const res = await paymentLinkRoute(req("http://x/api", { method: "POST" }), {
      params: Promise.resolve({ id: workspace.id, bookingId: booking.id }),
    });
    expect(res.status).toBe(403);
    const payments = await prisma.payment.count({ where: { bookingId: booking.id } });
    expect(payments).toBe(0);
  });
});

describe("dashboard payment visibility is role-gated", () => {
  it("viewer sees payment status/amount but not Stripe references; owner sees everything", async () => {
    const { owner, workspace, availability } = await createBookableFixture({ tour: { basePrice: 6000, capacity: 5 }, paymentAccount: true });
    const viewer = await createTestUser();
    await addMember(workspace.id, viewer.id, "viewer");

    const created = await publicCreateBookingRoute(
      req(`http://x/api/public/${workspace.slug}/bookings`, {
        method: "POST",
        body: JSON.stringify(bookingPayload(availability.id)),
      }),
      { params: Promise.resolve({ workspaceSlug: workspace.slug }) },
    );
    const { booking } = (await created.json()) as { booking: { reference: string } };
    const bookingRow = await prisma.booking.findFirstOrThrow({ where: { reference: booking.reference } });

    asUser(viewer);
    const asViewerDetail = await bookingDetailRoute(req("http://x/api"), {
      params: Promise.resolve({ id: workspace.id, bookingId: bookingRow.id }),
    });
    expect(asViewerDetail.status).toBe(200);
    const viewerBody = (await asViewerDetail.json()) as {
      payment: { status: string; amount: number } | null;
      paymentDetail: unknown;
    };
    expect(viewerBody.payment?.status).toBe("requires_payment");
    expect(viewerBody.payment?.amount).toBe(6000);
    expect(viewerBody.paymentDetail).toBeNull();

    const asViewerList = await listBookingsRoute(req(`http://x/api?workspaceId=${workspace.id}`), {
      params: Promise.resolve({ id: workspace.id }),
    });
    const listBody = (await asViewerList.json()) as { bookings: { payment: { status: string } | null }[] };
    expect(listBody.bookings[0].payment?.status).toBe("requires_payment");

    asUser(owner);
    const asOwnerDetail = await bookingDetailRoute(req("http://x/api"), {
      params: Promise.resolve({ id: workspace.id, bookingId: bookingRow.id }),
    });
    const ownerBody = (await asOwnerDetail.json()) as {
      paymentDetail: { providerCheckoutSessionId: string | null } | null;
    };
    expect(ownerBody.paymentDetail).not.toBeNull();
    expect(ownerBody.paymentDetail?.providerCheckoutSessionId).toMatch(/^cs_test_/);
  });
});

describe("cross-tenant payment isolation", () => {
  it("a payment cannot be reached through a different workspace's booking detail route", async () => {
    const { workspace, availability } = await createBookableFixture({ tour: { basePrice: 4500, capacity: 5 }, paymentAccount: true });
    const created = await publicCreateBookingRoute(
      req(`http://x/api/public/${workspace.slug}/bookings`, {
        method: "POST",
        body: JSON.stringify(bookingPayload(availability.id)),
      }),
      { params: Promise.resolve({ workspaceSlug: workspace.slug }) },
    );
    const { booking } = (await created.json()) as { booking: { reference: string } };
    const bookingRow = await prisma.booking.findFirstOrThrow({ where: { reference: booking.reference } });

    const otherOwner = await createTestUser();
    const otherWorkspace = await createTestWorkspace(otherOwner.id);
    await addMember(otherWorkspace.id, otherOwner.id, "workspace_owner");

    asUser(otherOwner);
    const res = await bookingDetailRoute(req("http://x/api"), {
      params: Promise.resolve({ id: otherWorkspace.id, bookingId: bookingRow.id }),
    });
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain("requires_payment");
  });
});
