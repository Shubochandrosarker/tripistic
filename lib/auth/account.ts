import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { hashPassword } from "@/lib/auth/passwords";
import {
  consumeAuthToken,
  hasRecentToken,
  issueAuthToken,
  revokeAuthTokens,
} from "@/lib/auth/tokens";
import { logger } from "@/lib/observability/logger";
import {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} from "@/lib/messaging/service";

/**
 * Email verification and password reset.
 *
 * The whole file is written around one rule: **an unauthenticated caller must
 * not be able to learn whether an email address has an account here.** That
 * turns every one of these endpoints into an account-enumeration oracle, which
 * is the raw material for credential stuffing and for targeted phishing.
 *
 * So the request paths below always report the same outcome — same shape, same
 * message — whether the address exists, does not exist, is already verified,
 * or is rate limited into doing nothing. Everything real that happens is
 * recorded server-side in the audit log.
 */

function appBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function buildVerificationUrl(token: string): string {
  return `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(token: string): string {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Issues and emails a verification link.
 *
 * Returns nothing about the account. Called from registration (where the
 * caller already knows the account exists, because it just made it) and from
 * the resend endpoint (where it must not reveal anything).
 */
export async function sendVerificationLink(
  email: string,
  options: { requestIp?: string | null } = {},
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, email: true, emailVerifiedAt: true, deletedAt: true, status: true },
  });

  if (!user || user.deletedAt || user.status !== "active") return;
  if (user.emailVerifiedAt) return; // Already verified — nothing to send.

  // A recently issued link is still in their inbox. Sending another would make
  // the resend button an email cannon pointed at an address the caller may not
  // own.
  if (await hasRecentToken(user.id, "email_verification")) return;

  const { token, expiresAt } = await issueAuthToken(user.id, "email_verification", {
    requestIp: options.requestIp,
  });

  await sendEmailVerificationEmail({
    userId: user.id,
    to: user.email,
    name: user.name,
    verifyUrl: buildVerificationUrl(token),
    expiresAt,
  });

  await recordAuditEvent({
    action: "user_verification_sent",
    userId: user.id,
    entityType: "user",
    entityId: user.id,
  });
}

export type VerifyEmailResult = { ok: true } | { ok: false; reason: "invalid" };

/**
 * Consumes a verification token and marks the address verified.
 *
 * Idempotent from the user's point of view in the case that matters: clicking
 * a link twice gives "invalid" the second time, but the account is already
 * verified, and the page treats an already-verified session as success rather
 * than showing an error for something that worked.
 */
export async function verifyEmailWithToken(token: string): Promise<VerifyEmailResult> {
  const outcome = await consumeAuthToken(token, "email_verification");
  if (!outcome.ok) {
    logger.info("auth.verification_rejected", { reason: outcome.reason });
    return { ok: false, reason: "invalid" };
  }

  await prisma.user.update({
    where: { id: outcome.userId },
    data: { emailVerifiedAt: new Date() },
  });

  await recordAuditEvent({
    action: "user_email_verified",
    userId: outcome.userId,
    entityType: "user",
    entityId: outcome.userId,
  });

  return { ok: true };
}

/**
 * Issues and emails a password reset link.
 *
 * Silent for unknown, deleted or suspended accounts — see the file header.
 */
export async function sendPasswordResetLink(
  email: string,
  options: { requestIp?: string | null } = {},
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, name: true, email: true, deletedAt: true, status: true, passwordHash: true },
  });

  if (!user || user.deletedAt || user.status !== "active") return;
  // An SSO-only account has no password to reset. Sending a link that cannot
  // work would be worse than silence.
  if (!user.passwordHash) return;
  if (await hasRecentToken(user.id, "password_reset")) return;

  const { token, expiresAt } = await issueAuthToken(user.id, "password_reset", {
    requestIp: options.requestIp,
  });

  await sendPasswordResetEmail({
    userId: user.id,
    to: user.email,
    name: user.name,
    resetUrl: buildPasswordResetUrl(token),
    expiresAt,
  });

  await recordAuditEvent({
    action: "user_password_reset_requested",
    userId: user.id,
    entityType: "user",
    entityId: user.id,
  });
}

export type ResetPasswordResult = { ok: true } | { ok: false; reason: "invalid" };

/**
 * Completes a password reset.
 *
 * Three things happen together, and all three matter:
 *
 *   - the password is replaced;
 *   - `sessionVersion` is bumped, which invalidates every existing JWT. Someone
 *     resetting because an attacker had their password would otherwise leave
 *     that attacker signed in — the reset would feel like it worked and change
 *     nothing;
 *   - the address is marked verified. Receiving mail at it is the proof
 *     verification was asking for, so an unverified user who resets should not
 *     then be told to verify.
 *
 * Remaining reset tokens are revoked afterwards, so a second link sitting in
 * the mailbox cannot set the password again.
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<ResetPasswordResult> {
  const outcome = await consumeAuthToken(token, "password_reset");
  if (!outcome.ok) {
    logger.info("auth.reset_rejected", { reason: outcome.reason });
    return { ok: false, reason: "invalid" };
  }

  const passwordHash = await hashPassword(newPassword);
  const user = await prisma.user.update({
    where: { id: outcome.userId },
    data: {
      passwordHash,
      sessionVersion: { increment: 1 },
      emailVerifiedAt: new Date(),
    },
    select: { id: true, name: true, email: true },
  });

  await revokeAuthTokens(outcome.userId, "password_reset");

  await recordAuditEvent({
    action: "user_password_reset_completed",
    userId: user.id,
    entityType: "user",
    entityId: user.id,
  });

  // Best effort, and deliberately not awaited into the failure path: if this
  // does not send, the reset still succeeded. It exists so that a reset the
  // account holder did not perform is visible to them.
  await sendPasswordChangedEmail({ userId: user.id, to: user.email, name: user.name }).catch(
    (error) => logger.error("auth.password_changed_notice_failed", { userId: user.id }, error),
  );

  return { ok: true };
}
