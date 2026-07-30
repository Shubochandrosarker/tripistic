import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the network-touching send is mocked; persistence runs for real against
// the test database, which is the whole point of these tests.
vi.mock("@/lib/messaging/mailer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/messaging/mailer")>("@/lib/messaging/mailer");
  return { ...actual, getMailer: vi.fn() };
});

import { getMailer } from "@/lib/messaging/mailer";
import { POST as contactRoute } from "@/app/api/marketing/contact/route";
import { POST as subscribeRoute } from "@/app/api/marketing/subscribe/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { prisma } from "./helpers";

const mockGetMailer = getMailer as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/marketing", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function contactPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Pat Operator",
    email: `contact-${randomUUID()}@example.com`,
    reason: "Sales",
    message: "We run day tours and would like to know more about direct bookings.",
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Phase 7 moved rate limiting into PostgreSQL, so clearing it is a delete
  // rather than resetting a module-level Map. Scoped to the two marketing
  // buckets so a concurrently running test file's budget is untouched.
  await prisma.rateLimitCounter.deleteMany({
    where: {
      OR: [
        { key: { startsWith: RATE_LIMITS.contactForm.bucket } },
        { key: { startsWith: RATE_LIMITS.newsletter.bucket } },
      ],
    },
  });
  delete process.env.SMTP_HOST;
});

describe("contact submissions survive email failure", () => {
  it("persists the enquiry when SMTP is not configured at all", async () => {
    const payload = contactPayload();
    const res = await contactRoute(req(payload));
    expect(res.status).toBe(202);

    const body = (await res.json()) as { received: boolean; notified: boolean };
    expect(body.received).toBe(true);
    // Honest: nothing was emailed, and the response says so.
    expect(body.notified).toBe(false);

    const row = await prisma.marketingContactSubmission.findFirstOrThrow({
      where: { emailNormalized: payload.email.toLowerCase() },
    });
    expect(row.name).toBe("Pat Operator");
    expect(row.reason).toBe("Sales");
    expect(row.deliveryStatus).toBe("skipped");
    expect(row.deliveryError).toMatch(/SMTP/i);
    expect(row.consentAt).toBeInstanceOf(Date);
  });

  it("persists the enquiry and records the reason when delivery throws", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    mockGetMailer.mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error("SMTP connection refused")),
    });

    const payload = contactPayload();
    const res = await contactRoute(req(payload));
    expect(res.status).toBe(202);
    expect(((await res.json()) as { notified: boolean }).notified).toBe(false);

    const row = await prisma.marketingContactSubmission.findFirstOrThrow({
      where: { emailNormalized: payload.email.toLowerCase() },
    });
    // The lead is kept; only the notification failed.
    expect(row.deliveryStatus).toBe("failed");
    expect(row.deliveryError).toContain("SMTP connection refused");
  });

  it("marks delivery sent when the mailer succeeds", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    mockGetMailer.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({ messageId: "ok" }) });

    const payload = contactPayload();
    const res = await contactRoute(req(payload));
    expect(((await res.json()) as { notified: boolean }).notified).toBe(true);

    const row = await prisma.marketingContactSubmission.findFirstOrThrow({
      where: { emailNormalized: payload.email.toLowerCase() },
    });
    expect(row.deliveryStatus).toBe("sent");
    expect(row.deliveredAt).not.toBeNull();
  });

  it("stores nothing for a honeypot hit but still returns 202", async () => {
    const payload = contactPayload({ website: "http://spam.example" });
    const res = await contactRoute(req(payload));
    // Accepted silently so a bot cannot detect the trap.
    expect(res.status).toBe(202);

    const count = await prisma.marketingContactSubmission.count({
      where: { emailNormalized: (payload.email as string).toLowerCase() },
    });
    expect(count).toBe(0);
  });

  it("rejects an invalid payload without persisting", async () => {
    const res = await contactRoute(req({ name: "", email: "nope", reason: "Sales", message: "x" }));
    expect(res.status).toBe(400);
    expect(await prisma.marketingContactSubmission.count({ where: { email: "nope" } })).toBe(0);
  });
});

describe("newsletter subscribers survive email failure", () => {
  it("persists the subscriber when SMTP is not configured", async () => {
    const email = `sub-${randomUUID()}@example.com`;
    const res = await subscribeRoute(req({ email, source: "newsletter" }));
    expect(res.status).toBe(202);

    const body = (await res.json()) as { subscribed: boolean; confirmationSent: boolean };
    expect(body.subscribed).toBe(true);
    // The UI keys its copy off this: no claim of a confirmation email.
    expect(body.confirmationSent).toBe(false);

    const row = await prisma.newsletterSubscriber.findUniqueOrThrow({
      where: { emailNormalized: email.toLowerCase() },
    });
    expect(row.status).toBe("pending_confirmation");
    expect(row.deliveryStatus).toBe("skipped");
  });

  it("normalizes case so the same address cannot subscribe twice", async () => {
    const local = `Dup-${randomUUID()}`;
    const email = `${local}@Example.COM`;

    const first = await subscribeRoute(req({ email }));
    const second = await subscribeRoute(req({ email: email.toLowerCase() }));

    // Identical status and body — a distinguishable response would let anyone
    // test whether an address is already on the list.
    expect(first.status).toBe(second.status);
    expect(await first.json()).toEqual(await second.json());

    const rows = await prisma.newsletterSubscriber.findMany({
      where: { emailNormalized: email.toLowerCase() },
    });
    expect(rows).toHaveLength(1);
  });

  it("re-subscribing after unsubscribe restores the subscription with fresh consent", async () => {
    const email = `resub-${randomUUID()}@example.com`;
    await subscribeRoute(req({ email }));
    await prisma.newsletterSubscriber.update({
      where: { emailNormalized: email.toLowerCase() },
      data: { status: "unsubscribed", unsubscribedAt: new Date() },
    });

    await subscribeRoute(req({ email }));

    const row = await prisma.newsletterSubscriber.findUniqueOrThrow({
      where: { emailNormalized: email.toLowerCase() },
    });
    expect(row.status).toBe("pending_confirmation");
    expect(row.unsubscribedAt).toBeNull();
  });
});

describe("abuse controls", () => {
  it("returns 429 with Retry-After once the window is exhausted", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    const headers = { "x-forwarded-for": ip };

    for (let i = 0; i < 5; i += 1) {
      const ok = await subscribeRoute(req({ email: `rl-${randomUUID()}@example.com` }, headers));
      expect(ok.status).toBe(202);
    }

    const limited = await subscribeRoute(req({ email: `rl-${randomUUID()}@example.com` }, headers));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("stores a digest rather than the raw client IP", async () => {
    const email = `hash-${randomUUID()}@example.com`;
    await subscribeRoute(req({ email }, { "x-forwarded-for": "198.51.100.7" }));

    const row = await prisma.newsletterSubscriber.findUniqueOrThrow({
      where: { emailNormalized: email.toLowerCase() },
    });
    expect(row.clientHash).toBeTruthy();
    expect(row.clientHash).not.toContain("198.51.100.7");
  });
});
