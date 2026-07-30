import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_ATTEMPTS,
  RETRY_BACKOFF_MS,
  buildDedupeKey,
  isOutboxPayload,
  isPermanentFailure,
  nextRetryTime,
  retryDelayMs,
} from "@/lib/messaging/outbox";

/**
 * docs/FINAL-LAUNCH-AUDIT.md §5 — transactional email had no retry at all. A
 * single failed attempt wrote `status: failed` and nothing ever looked at the
 * row again, so a brief SMTP outage permanently destroyed every booking
 * confirmation queued during it.
 */

describe("retry backoff", () => {
  it("grows with each attempt rather than hammering a provider that is already unhealthy", () => {
    const delays = [1, 2, 3, 4, 5].map(retryDelayMs);
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });

  it("absorbs a brief blip within minutes", () => {
    expect(retryDelayMs(1)).toBeLessThanOrEqual(60_000);
  });

  it("still has attempts left hours into a longer outage", () => {
    const total = [1, 2, 3, 4, 5].reduce((sum, n) => sum + retryDelayMs(n), 0);
    expect(total).toBeGreaterThan(6 * 60 * 60 * 1000);
  });

  it("clamps past the end of the schedule instead of returning undefined", () => {
    // maxAttempts is stored per row, so it can exceed the schedule length if
    // the default is ever raised. That must not produce NaN dates.
    const beyond = retryDelayMs(99);
    expect(beyond).toBe(RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]);
    expect(Number.isFinite(beyond)).toBe(true);
  });

  it("treats a zero or negative attempt as the first", () => {
    expect(retryDelayMs(0)).toBe(RETRY_BACKOFF_MS[0]);
    expect(retryDelayMs(-3)).toBe(RETRY_BACKOFF_MS[0]);
  });

  it("schedules forward from the given instant", () => {
    const from = new Date("2026-03-14T12:00:00.000Z");
    const next = nextRetryTime(1, from);
    expect(next.getTime()).toBe(from.getTime() + retryDelayMs(1));
    expect(Number.isNaN(next.getTime())).toBe(false);
  });
});

describe("permanent vs transient failure", () => {
  it("treats 5xx provider rejections as permanent", () => {
    expect(isPermanentFailure("550 5.1.1 mailbox unavailable")).toBe(true);
    expect(isPermanentFailure("553 bad address")).toBe(true);
  });

  it("treats bad recipients as permanent — retrying cannot conjure a mailbox", () => {
    expect(isPermanentFailure("Invalid recipient")).toBe(true);
    expect(isPermanentFailure("No such user here")).toBe(true);
    expect(isPermanentFailure("Recipient address rejected")).toBe(true);
  });

  it("treats connection-level errors as transient", () => {
    expect(isPermanentFailure("ETIMEDOUT")).toBe(false);
    expect(isPermanentFailure("Connection closed unexpectedly")).toBe(false);
    expect(isPermanentFailure("451 temporary local problem")).toBe(false);
    expect(isPermanentFailure("421 service not available, closing channel")).toBe(false);
  });

  it("does not mistake a port number for an SMTP 5xx reply", () => {
    // A naive /\b5\d{2}\b/ matches the `:587` here and classifies an ordinary
    // connection refusal as permanent — which destroys the message rather
    // than retrying it. That is the worst direction to be wrong in.
    expect(isPermanentFailure("connect ECONNREFUSED 10.0.0.4:587")).toBe(false);
    expect(isPermanentFailure("Error connecting to smtp.example.com port 587")).toBe(false);
    expect(isPermanentFailure("socket hang up after 502 ms")).toBe(false);
  });

  it("recognises an enhanced status code", () => {
    expect(isPermanentFailure("5.1.1 The email account does not exist")).toBe(true);
    expect(isPermanentFailure("4.4.1 temporary routing failure")).toBe(false);
  });

  it("treats missing configuration as transient", () => {
    // getMailer() throws this on a fresh deployment before email is wired up.
    // Permanent would burn all five attempts within minutes of boot and kill
    // exactly the messages most worth keeping.
    expect(
      isPermanentFailure("SMTP_HOST is not configured — email delivery is unavailable until it is set."),
    ).toBe(false);
    expect(isPermanentFailure("Email delivery is not configured")).toBe(false);
  });

  it("defaults to transient for an unrecognised or absent error", () => {
    // A message retried unnecessarily is recoverable; one dropped is not.
    expect(isPermanentFailure(null)).toBe(false);
    expect(isPermanentFailure(undefined)).toBe(false);
    expect(isPermanentFailure("something nobody anticipated")).toBe(false);
  });
});

describe("dedupe key", () => {
  const base = {
    workspaceId: "ws_1",
    templateKey: "booking_confirmation" as const,
    bookingId: "bk_1",
    to: "Guest@Example.com",
  };

  it("is stable across time, so a retry collides with the original", () => {
    expect(buildDedupeKey(base)).toBe(buildDedupeKey(base));
  });

  it("normalises the recipient, so casing cannot produce a second email", () => {
    expect(buildDedupeKey({ ...base, to: "guest@example.com" })).toBe(
      buildDedupeKey({ ...base, to: "  GUEST@EXAMPLE.COM  " }),
    );
  });

  it("separates different templates, bookings and workspaces", () => {
    const keys = new Set([
      buildDedupeKey(base),
      buildDedupeKey({ ...base, templateKey: "booking_reminder" }),
      buildDedupeKey({ ...base, bookingId: "bk_2" }),
      buildDedupeKey({ ...base, workspaceId: "ws_2" }),
      buildDedupeKey({ ...base, to: "other@example.com" }),
    ]);
    expect(keys.size).toBe(5);
  });

  it("lets a discriminator distinguish legitimately repeatable sends", () => {
    // A departure can slip twice; the second delay is a new notice.
    expect(buildDedupeKey({ ...base, discriminator: "delay-30" })).not.toBe(
      buildDedupeKey({ ...base, discriminator: "delay-90" }),
    );
  });

  it("handles a message with no booking without colliding across recipients", () => {
    const a = buildDedupeKey({ workspaceId: "ws_1", templateKey: "member_invitation", to: "a@x.com" });
    const b = buildDedupeKey({ workspaceId: "ws_1", templateKey: "member_invitation", to: "b@x.com" });
    expect(a).not.toBe(b);
  });
});

describe("stored payload", () => {
  const valid = { to: "a@b.com", from: "c@d.com", subject: "s", text: "t", html: "<p>t</p>" };

  it("accepts a complete payload", () => {
    expect(isOutboxPayload(valid)).toBe(true);
  });

  it("rejects anything the retry sweep could not actually send", () => {
    expect(isOutboxPayload(null)).toBe(false);
    expect(isOutboxPayload(undefined)).toBe(false);
    expect(isOutboxPayload("a string")).toBe(false);
    expect(isOutboxPayload({})).toBe(false);
    expect(isOutboxPayload({ ...valid, to: undefined })).toBe(false);
    expect(isOutboxPayload({ ...valid, subject: 42 })).toBe(false);
  });
});

describe("attempt budget", () => {
  it("is finite, so a permanently broken address cannot retry forever", () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(DEFAULT_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});
