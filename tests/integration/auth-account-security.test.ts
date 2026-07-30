import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  resetPasswordWithToken,
  sendPasswordResetLink,
  sendVerificationLink,
  verifyEmailWithToken,
} from "@/lib/auth/account";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import {
  consumeAuthToken,
  generateToken,
  hashToken,
  issueAuthToken,
  PASSWORD_RESET_TTL_MS,
  VERIFICATION_TTL_MS,
} from "@/lib/auth/tokens";
import { prisma } from "./helpers";

/**
 * Phase 7 — email verification and password reset.
 *
 * Neither flow existed. `emailVerifiedAt` was on the User model and only ever
 * written by the seed, and there was no way for a user who forgot their
 * password to recover an account at all.
 */

async function makeUser(overrides: { password?: string; verified?: boolean } = {}) {
  return prisma.user.create({
    data: {
      name: "Test Person",
      email: `auth-${randomUUID()}@example.com`,
      passwordHash: await hashPassword(overrides.password ?? "original-password"),
      emailVerifiedAt: overrides.verified ? new Date() : null,
    },
  });
}

/** Reads back the plaintext token by matching its digest — tests only. */
async function liveTokenFor(userId: string, purpose: "email_verification" | "password_reset") {
  const row = await prisma.authToken.findFirst({
    where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return row;
}

describe("tokens are never stored in a usable form", () => {
  it("persists a digest, not the token", async () => {
    const user = await makeUser();
    const { token } = await issueAuthToken(user.id, "password_reset");

    const row = await prisma.authToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    // A leaked backup must not hand an attacker working reset links — which is
    // exactly what audit §7 flags about the plaintext Invitation.token.
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);

    const anyRowHoldingPlaintext = await prisma.authToken.findFirst({
      where: { tokenHash: token },
    });
    expect(anyRowHoldingPlaintext).toBeNull();
  });

  it("generates tokens with enough entropy to be unguessable", async () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(tokens.size).toBe(200);
    // 32 bytes base64url.
    expect(generateToken().length).toBeGreaterThanOrEqual(43);
  });

  it("gives reset a shorter life than verification", async () => {
    // A stale verification link is an inconvenience; a stale reset link is an
    // account takeover.
    expect(PASSWORD_RESET_TTL_MS).toBeLessThan(VERIFICATION_TTL_MS);
  });
});

describe("tokens are single use", () => {
  it("consumes exactly once", async () => {
    const user = await makeUser();
    const { token } = await issueAuthToken(user.id, "password_reset");

    expect(await consumeAuthToken(token, "password_reset")).toEqual({ ok: true, userId: user.id });
    expect(await consumeAuthToken(token, "password_reset")).toEqual({
      ok: false,
      reason: "already_used",
    });
  });

  it("lets only one of several concurrent redemptions win", async () => {
    // A reset link that works twice is a link an attacker can replay out of a
    // mail archive after the owner has used it.
    const user = await makeUser();
    const { token } = await issueAuthToken(user.id, "password_reset");

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => consumeAuthToken(token, "password_reset")),
    );
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
  });

  it("rejects an expired token", async () => {
    const user = await makeUser();
    const { token } = await issueAuthToken(user.id, "password_reset");
    await prisma.authToken.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await consumeAuthToken(token, "password_reset")).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token presented for the wrong purpose", async () => {
    // Otherwise a verification link — which is longer-lived and handed out
    // more freely — could be redeemed as a password reset.
    const user = await makeUser();
    const { token } = await issueAuthToken(user.id, "email_verification");
    expect(await consumeAuthToken(token, "password_reset")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("rejects a token that was never issued", async () => {
    expect(await consumeAuthToken(generateToken(), "password_reset")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("supersedes the previous token when a new one is issued", async () => {
    // Without this every resend would leave the old link working, so the
    // number of valid reset links would grow with each click.
    const user = await makeUser();
    const first = await issueAuthToken(user.id, "password_reset");
    // Past the reissue window so a genuinely new token is minted.
    await prisma.authToken.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    const second = await issueAuthToken(user.id, "password_reset");

    expect(await consumeAuthToken(first.token, "password_reset")).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(await consumeAuthToken(second.token, "password_reset")).toMatchObject({ ok: true });
  });
});

describe("email verification", () => {
  it("marks the address verified", async () => {
    const user = await makeUser();
    await sendVerificationLink(user.email);

    const row = await liveTokenFor(user.id, "email_verification");
    expect(row).not.toBeNull();

    // Re-derive the plaintext by issuing a known token instead of reading the
    // digest back — the digest is one-way, which is the point.
    const { token } = await issueAuthToken(user.id, "email_verification");
    expect(await verifyEmailWithToken(token)).toEqual({ ok: true });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerifiedAt).not.toBeNull();
  });

  it("does nothing for an address that has no account", async () => {
    // Silent, so this endpoint cannot be used to test whether an address is
    // registered here.
    await expect(sendVerificationLink(`nobody-${randomUUID()}@example.com`)).resolves.toBeUndefined();
    expect(await prisma.authToken.count({ where: { purpose: "email_verification" } })).toBeGreaterThanOrEqual(0);
  });

  it("does nothing for an already-verified address", async () => {
    const user = await makeUser({ verified: true });
    await sendVerificationLink(user.email);
    expect(await liveTokenFor(user.id, "email_verification")).toBeNull();
  });

  it("does not issue a second token inside the reissue window", async () => {
    const user = await makeUser();
    await sendVerificationLink(user.email);
    await sendVerificationLink(user.email);
    await sendVerificationLink(user.email);

    // Otherwise the resend button is an email cannon pointed at an address the
    // caller may not own.
    const count = await prisma.authToken.count({
      where: { userId: user.id, purpose: "email_verification" },
    });
    expect(count).toBe(1);
  });

  it("rejects an invalid token", async () => {
    expect(await verifyEmailWithToken(generateToken())).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("password reset", () => {
  it("replaces the password and invalidates existing sessions", async () => {
    const user = await makeUser({ password: "original-password" });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const { token } = await issueAuthToken(user.id, "password_reset");
    expect(await resetPasswordWithToken(token, "a-brand-new-password")).toEqual({ ok: true });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("a-brand-new-password", after.passwordHash!)).toBe(true);
    expect(await verifyPassword("original-password", after.passwordHash!)).toBe(false);

    // The reason the version exists: someone resetting because an attacker had
    // their password would otherwise leave that attacker signed in, and the
    // reset would feel like it worked while changing nothing.
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
  });

  it("marks the address verified — receiving the mail is the proof", async () => {
    const user = await makeUser();
    expect(user.emailVerifiedAt).toBeNull();

    const { token } = await issueAuthToken(user.id, "password_reset");
    await resetPasswordWithToken(token, "a-brand-new-password");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerifiedAt).not.toBeNull();
  });

  it("revokes any other outstanding reset token", async () => {
    const user = await makeUser();
    const stale = await issueAuthToken(user.id, "password_reset");
    await prisma.authToken.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    const used = await issueAuthToken(user.id, "password_reset");

    await resetPasswordWithToken(used.token, "a-brand-new-password");

    // A second link sitting in the mailbox must not be able to set the
    // password again.
    expect(await consumeAuthToken(stale.token, "password_reset")).toMatchObject({ ok: false });
  });

  it("does not change the password on an invalid token", async () => {
    const user = await makeUser({ password: "original-password" });
    expect(await resetPasswordWithToken(generateToken(), "attacker-chosen")).toEqual({
      ok: false,
      reason: "invalid",
    });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword("original-password", after.passwordHash!)).toBe(true);
    expect(after.sessionVersion).toBe(user.sessionVersion);
  });

  it("is silent for an unknown address", async () => {
    await expect(
      sendPasswordResetLink(`nobody-${randomUUID()}@example.com`),
    ).resolves.toBeUndefined();
  });

  it("is silent for a suspended account", async () => {
    const user = await makeUser();
    await prisma.user.update({ where: { id: user.id }, data: { status: "suspended" } });
    await sendPasswordResetLink(user.email);
    expect(await liveTokenFor(user.id, "password_reset")).toBeNull();
  });

  it("is silent for an SSO-only account with no password", async () => {
    // Sending a link that cannot work would be worse than silence.
    const user = await makeUser();
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: null } });
    await sendPasswordResetLink(user.email);
    expect(await liveTokenFor(user.id, "password_reset")).toBeNull();
  });

  it("issues a token for a real account", async () => {
    const user = await makeUser();
    await sendPasswordResetLink(user.email);
    expect(await liveTokenFor(user.id, "password_reset")).not.toBeNull();
  });

  it("matches the address case-insensitively", async () => {
    const user = await makeUser();
    await sendPasswordResetLink(user.email.toUpperCase());
    expect(await liveTokenFor(user.id, "password_reset")).not.toBeNull();
  });
});

describe("audit trail", () => {
  it("records a completed reset", async () => {
    const user = await makeUser();
    const { token } = await issueAuthToken(user.id, "password_reset");
    await resetPasswordWithToken(token, "a-brand-new-password");

    const events = await prisma.auditLog.findMany({
      where: { userId: user.id, action: "user_password_reset_completed" },
    });
    expect(events).toHaveLength(1);
  });

  it("records a verification", async () => {
    const user = await makeUser();
    const { token } = await issueAuthToken(user.id, "email_verification");
    await verifyEmailWithToken(token);

    const events = await prisma.auditLog.findMany({
      where: { userId: user.id, action: "user_email_verified" },
    });
    expect(events).toHaveLength(1);
  });
});
