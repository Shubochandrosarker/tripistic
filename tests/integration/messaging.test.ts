import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the network-touching sendMail call is mocked — everything else in
// the messaging stack (template rendering, Message row tracking, consent
// gating) runs for real against the test database, exactly like Phase 4's
// stripe-client mocking strategy in payment-flow.test.ts.
vi.mock("@/lib/messaging/mailer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/messaging/mailer")>("@/lib/messaging/mailer");
  return { ...actual, getMailer: vi.fn() };
});

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { getMailer } from "@/lib/messaging/mailer";
import { requireUserApi } from "@/lib/auth/session";
import { createBooking } from "@/lib/bookings/service";
import { transitionBookingStatus } from "@/lib/bookings/status-service";
import { processStripeWebhookEvent } from "@/lib/payments/webhook-service";
import { sendReviewRequestEmail, sendMemberInvitationEmail } from "@/lib/messaging/service";
import { POST as invitationsRoute } from "@/app/api/workspaces/[id]/invitations/route";
import {
  addMember,
  createBookableFixture,
  createTestSubscription,
  createTestUser,
  createTestWorkspace,
  fakeStripeEvent,
  prisma,
} from "./helpers";

const mockGetMailer = getMailer as unknown as ReturnType<typeof vi.fn>;
const mockRequireUserApi = requireUserApi as unknown as ReturnType<typeof vi.fn>;

function fakeMailer(overrides: { fails?: boolean } = {}) {
  const sendMail = overrides.fails
    ? vi.fn().mockRejectedValue(new Error("SMTP connection refused"))
    : vi.fn().mockResolvedValue({ messageId: `test-msg-${randomUUID().slice(0, 8)}` });
  return { sendMail };
}

function asUser(user: { id: string }) {
  mockRequireUserApi.mockResolvedValue(user);
}

function req(url: string, init?: RequestInit) {
  return new Request(url, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMailer.mockReturnValue(fakeMailer());
});

function bookingInput(workspaceId: string, tourId: string, availabilityId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    tourId,
    availabilityId,
    participantCount: 1,
    participants: [{ firstName: "Guest", lastName: "One" }],
    guestFirstName: "Guest",
    guestLastName: "One",
    guestEmail: `msg-guest-${randomUUID()}@example.com`,
    addons: [],
    source: "public_direct" as const,
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

async function confirmationMessagesFor(bookingId: string) {
  return prisma.message.findMany({ where: { bookingId, templateKey: "booking_confirmation" } });
}

describe("booking confirmation email — all trigger paths", () => {
  it("a free public booking confirms immediately and sends exactly one confirmation email", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0, capacity: 5 } });

    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));
    expect(booking.status).toBe("confirmed");

    const messages = await confirmationMessagesFor(booking.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("sent");
    expect(messages[0].providerMessageId).toMatch(/^test-msg-/);
    expect(messages[0].toEmail).toBe(booking.guestEmail);
  });

  it("a manual booking created directly as confirmed sends exactly one confirmation email", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const tour = await prisma.tour.create({
      data: {
        workspaceId: workspace.id,
        title: "Manual Confirmed Tour",
        slug: `manual-confirmed-${randomUUID().slice(0, 8)}`,
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
        startsAt: new Date(Date.now() + 3 * 86_400_000),
        endsAt: new Date(Date.now() + 3 * 86_400_000 + 3_600_000),
        capacity: 5,
      },
    });

    const { booking } = await createBooking(
      bookingInput(workspace.id, tour.id, availability.id, {
        source: "manual",
        requirePublicVisibility: false,
        status: "confirmed",
        createdById: owner.id,
      }),
    );
    expect(booking.status).toBe("confirmed");

    const messages = await confirmationMessagesFor(booking.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("sent");
  });

  it("an idempotent replay of a confirmed booking does not send a second confirmation email", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0, capacity: 5 } });
    const payload = bookingInput(workspace.id, tour.id, availability.id);

    const first = await createBooking(payload);
    expect(first.idempotentReplay).toBe(false);
    const second = await createBooking(payload);
    expect(second.idempotentReplay).toBe(true);

    const messages = await confirmationMessagesFor(first.booking.id);
    expect(messages).toHaveLength(1);
  });

  it("a manual pending booking transitioned to confirmed sends exactly one confirmation email", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const tour = await prisma.tour.create({
      data: {
        workspaceId: workspace.id,
        title: "Manual Pending Tour",
        slug: `manual-pending-${randomUUID().slice(0, 8)}`,
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
        startsAt: new Date(Date.now() + 3 * 86_400_000),
        endsAt: new Date(Date.now() + 3 * 86_400_000 + 3_600_000),
        capacity: 5,
      },
    });
    const { booking } = await createBooking(
      bookingInput(workspace.id, tour.id, availability.id, {
        source: "manual",
        requirePublicVisibility: false,
        status: "pending",
        createdById: owner.id,
      }),
    );
    expect(booking.status).toBe("pending");
    expect(await confirmationMessagesFor(booking.id)).toHaveLength(0);

    await transitionBookingStatus({
      workspaceId: workspace.id,
      bookingId: booking.id,
      toStatus: "confirmed",
      actor: { kind: "user", userId: owner.id },
    });

    const messages = await confirmationMessagesFor(booking.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("sent");
  });

  it("a Stripe webhook confirming a paid booking sends exactly one confirmation email", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 5000, capacity: 5 } });
    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));
    expect(booking.status).toBe("pending"); // paid bookings wait for the webhook

    const payment = await prisma.payment.create({
      data: {
        workspaceId: workspace.id,
        bookingId: booking.id,
        provider: "stripe",
        providerCheckoutSessionId: `cs_test_${randomUUID().slice(0, 12)}`,
        providerPaymentIntentId: `pi_test_${randomUUID().slice(0, 12)}`,
        amount: booking.totalAmount,
        currency: booking.currency,
        status: "requires_payment",
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    await processStripeWebhookEvent(
      fakeStripeEvent("payment_intent.succeeded", {
        id: payment.providerPaymentIntentId,
        object: "payment_intent",
        payment_method_types: ["card"],
      }),
    );

    const confirmedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(confirmedBooking.status).toBe("confirmed");

    const messages = await confirmationMessagesFor(booking.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("sent");
  });

  /**
   * This case previously asserted `status: "failed"`. That was the defect
   * recorded in docs/FINAL-LAUNCH-AUDIT.md §5, not the contract: a connection
   * refusal is transient, and treating it as terminal meant a brief SMTP
   * outage permanently destroyed every confirmation queued during it. The
   * outbox now schedules a retry, and the assertions below check that rather
   * than merely inverting the old expectation.
   */
  it("schedules a retry for a transient SMTP failure and does not throw into the caller", async () => {
    mockGetMailer.mockReturnValue(fakeMailer({ fails: true }));
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0, capacity: 5 } });

    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));
    expect(booking.status).toBe("confirmed"); // the booking itself succeeded regardless of email delivery

    const messages = await confirmationMessagesFor(booking.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("pending_retry");
    expect(messages[0].errorMessage).toContain("SMTP connection refused");
    expect(messages[0].attempts).toBe(1);
    expect(messages[0].nextRetryAt).not.toBeNull();
    // The rendered body is kept so the retry has something to send.
    expect(messages[0].payload).not.toBeNull();
  });
});

describe("review request — consent gating", () => {
  it("sends to a customer with unknown (default) consent status", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0, capacity: 5 } });
    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: booking.customerId! } });
    expect(customer.consentStatus).toBe("unknown");

    await sendReviewRequestEmail(booking.id);

    const messages = await prisma.message.findMany({ where: { bookingId: booking.id, templateKey: "review_request" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("sent");
  });

  it("sends to a customer who has explicitly subscribed", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0, capacity: 5 } });
    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));
    await prisma.customer.update({ where: { id: booking.customerId! }, data: { consentStatus: "subscribed" } });

    await sendReviewRequestEmail(booking.id);

    const messages = await prisma.message.findMany({ where: { bookingId: booking.id, templateKey: "review_request" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("sent");
  });

  it("skips (and records, not silently drops) a review request for an unsubscribed customer", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0, capacity: 5 } });
    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));
    await prisma.customer.update({ where: { id: booking.customerId! }, data: { consentStatus: "unsubscribed" } });

    const callsBeforeReviewRequest = mockGetMailer.mock.calls.length; // the booking's own confirmation email already called it once
    await sendReviewRequestEmail(booking.id);

    const messages = await prisma.message.findMany({ where: { bookingId: booking.id, templateKey: "review_request" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("skipped");
    expect(mockGetMailer.mock.calls.length).toBe(callsBeforeReviewRequest); // no additional send attempted
  });

  it("a booking transitioned to completed triggers the review request automatically", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const { tour, availability } = await createBookableFixture({ tour: { basePrice: 0, capacity: 5 } });
    void tour;
    void availability;
    const ownTour = await prisma.tour.create({
      data: {
        workspaceId: workspace.id,
        title: "Completed Tour",
        slug: `completed-${randomUUID().slice(0, 8)}`,
        durationMinutes: 60,
        capacity: 5,
        basePrice: 0,
        status: "active",
        visibility: "public",
      },
    });
    const ownAvailability = await prisma.availability.create({
      data: {
        workspaceId: workspace.id,
        tourId: ownTour.id,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        capacity: 5,
      },
    });
    const { booking } = await createBooking(bookingInput(workspace.id, ownTour.id, ownAvailability.id));
    expect(booking.status).toBe("confirmed");

    await transitionBookingStatus({
      workspaceId: workspace.id,
      bookingId: booking.id,
      toStatus: "completed",
      actor: { kind: "user", userId: owner.id },
    });

    const reviewMessages = await prisma.message.findMany({ where: { bookingId: booking.id, templateKey: "review_request" } });
    expect(reviewMessages).toHaveLength(1);
    expect(reviewMessages[0].status).toBe("sent");
  });
});

describe("member invitation email — best effort", () => {
  it("sendMemberInvitationEmail tracks a sent Message row", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");

    await sendMemberInvitationEmail({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      inviterName: owner.name ?? "Owner",
      role: "workspace_admin",
      email: "invitee@example.com",
      inviteUrl: "https://example.com/invite/tok",
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });

    const messages = await prisma.message.findMany({ where: { workspaceId: workspace.id, templateKey: "member_invitation" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("sent");
  });

  it("the invitation route still returns a usable inviteUrl even when email delivery throws", async () => {
    mockGetMailer.mockReturnValue(fakeMailer({ fails: true }));
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    // The invitations route enforces the plan seat limit, which needs a subscription.
    await createTestSubscription(workspace.id);
    asUser(owner);

    const res = await invitationsRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ email: "new-member@example.com", role: "workspace_admin" }),
      }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { inviteUrl: string };
    expect(body.inviteUrl).toContain("/invite/");

    const messages = await prisma.message.findMany({ where: { workspaceId: workspace.id, templateKey: "member_invitation" } });
    expect(messages).toHaveLength(1);
    // Retryable, not terminal — an invitation lost to a transient outage
    // leaves a colleague unable to join with nothing to resend it.
    expect(messages[0].status).toBe("pending_retry");
    expect(messages[0].nextRetryAt).not.toBeNull();
  });
});
