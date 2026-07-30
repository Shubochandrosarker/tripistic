import { createHash, randomBytes } from "node:crypto";

import type { AuthTokenPurpose } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * Single-use tokens for email verification and password reset.
 *
 * Three properties, each of which has to hold or the flow is not worth having:
 *
 *   1. **Stored hashed.** `Invitation.token` is plaintext, which audit §7
 *      flags because a leaked backup hands an attacker working invitation
 *      links. These store a SHA-256 digest, so a database dump authenticates
 *      nobody — the secret exists only in the email that was sent.
 *   2. **Single use.** Consumption is a conditional UPDATE, so two concurrent
 *      submissions of the same link cannot both succeed. A reset link that
 *      works twice is a reset link an attacker can replay from a mail archive.
 *   3. **Short lived**, and shorter for reset than for verification, because
 *      a stale verification link is an inconvenience while a stale reset link
 *      is an account takeover.
 *
 * Plain SHA-256 rather than a password hash is correct here: the token is 32
 * bytes of CSPRNG output, so there is no dictionary to attack and the slow
 * hashing that protects human-chosen passwords buys nothing.
 */

export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** How recently a token must have been issued to be reused instead of reissued. */
export const REISSUE_WINDOW_MS = 2 * 60 * 1000;

export function generateToken(): string {
  // 32 bytes — 256 bits of entropy. base64url so it survives a URL untouched.
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function ttlFor(purpose: AuthTokenPurpose): number {
  return purpose === "password_reset" ? PASSWORD_RESET_TTL_MS : VERIFICATION_TTL_MS;
}

export type IssuedToken = { token: string; expiresAt: Date };

/**
 * Issues a token, invalidating any earlier live one for the same purpose.
 *
 * Superseding matters: without it, every "resend" would leave the previous
 * link working, so the number of valid reset links for an account would grow
 * with each click and each one would be an independent chance for an attacker
 * with mailbox access.
 */
export async function issueAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
  options: { requestIp?: string | null; now?: Date } = {},
): Promise<IssuedToken> {
  const now = options.now ?? new Date();
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + ttlFor(purpose));

  await prisma.$transaction(async (tx) => {
    await tx.authToken.updateMany({
      where: { userId, purpose, consumedAt: null, expiresAt: { gt: now } },
      // Expiring rather than deleting keeps "this link was superseded"
      // distinguishable from "this link never existed" in the audit trail.
      data: { expiresAt: now },
    });
    await tx.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt,
        requestIp: options.requestIp ?? null,
      },
    });
  });

  return { token, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

/**
 * Validates and consumes a token in one atomic step.
 *
 * The conditional UPDATE is what makes it single-use under concurrency: the
 * database decides the winner, so two simultaneous clicks on the same reset
 * link cannot both set a password.
 *
 * The distinction between "not found" and "expired" is kept internal — the
 * caller collapses both into one user-facing message so a token guess never
 * learns whether it was close.
 */
export async function consumeAuthToken(
  token: string,
  purpose: AuthTokenPurpose,
  now: Date = new Date(),
): Promise<ConsumeResult> {
  const tokenHash = hashToken(token);

  const claimed = await prisma.$queryRaw<{ user_id: string }[]>`
    UPDATE auth_tokens SET consumed_at = ${now}
    WHERE token_hash = ${tokenHash}
      AND purpose = ${purpose}::auth_token_purpose
      AND consumed_at IS NULL
      AND expires_at > ${now}
    RETURNING user_id
  `;

  if (claimed.length > 0) return { ok: true, userId: claimed[0].user_id };

  // Nothing was claimed. Read the row to report the precise reason to the
  // audit log — the caller still shows the user one generic message.
  const existing = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: { consumedAt: true, expiresAt: true, purpose: true },
  });
  if (!existing || existing.purpose !== purpose) return { ok: false, reason: "not_found" };
  if (existing.consumedAt) return { ok: false, reason: "already_used" };
  return { ok: false, reason: "expired" };
}

/**
 * Whether a token was issued recently enough to skip sending another email.
 *
 * Stops a "resend" button from being an email cannon: repeated presses inside
 * the window are accepted and do nothing, which the caller reports the same
 * way as a successful send so the behaviour is not observable.
 */
export async function hasRecentToken(
  userId: string,
  purpose: AuthTokenPurpose,
  now: Date = new Date(),
): Promise<boolean> {
  const recent = await prisma.authToken.findFirst({
    where: {
      userId,
      purpose,
      consumedAt: null,
      expiresAt: { gt: now },
      createdAt: { gt: new Date(now.getTime() - REISSUE_WINDOW_MS) },
    },
    select: { id: true },
  });
  return recent !== null;
}

/** Expires every live token for a user. Called when a password changes. */
export async function revokeAuthTokens(
  userId: string,
  purpose: AuthTokenPurpose,
  now: Date = new Date(),
): Promise<number> {
  const result = await prisma.authToken.updateMany({
    where: { userId, purpose, consumedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  return result.count;
}

/** Removes tokens long past their usefulness. Called by the cleanup job. */
export async function pruneExpiredAuthTokens(now: Date = new Date()): Promise<number> {
  // A week's grace so "already used" stays answerable for a while after expiry.
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.authToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  return result.count;
}
