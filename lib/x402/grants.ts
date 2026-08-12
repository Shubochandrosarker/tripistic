import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/db";

import type { X402Route } from "@/lib/x402/config";

/**
 * Access grants: the bearer token a verified payment buys.
 *
 * The token is generated once, returned once, and never stored. What is stored
 * is its SHA-256, so a leaked `x402_access_grants` table is a list of hashes
 * rather than a set of working credentials — the same reasoning as password
 * storage, minus the need for a slow KDF because the secret is 32 bytes of
 * CSPRNG output rather than something a person chose.
 *
 * Consumption is a conditional UPDATE, not read-then-write. Two concurrent
 * calls on a grant with one use remaining must not both succeed, and the only
 * reliable place to decide that is the database.
 */

export type GrantIssue = { token: string; expiresAt: Date; maxUses: number };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueGrant(input: {
  paymentId: string;
  workspaceId: string | null;
  route: X402Route;
}): Promise<GrantIssue> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + input.route.ttlSeconds * 1_000);

  await prisma.x402AccessGrant.create({
    data: {
      paymentId: input.paymentId,
      workspaceId: input.workspaceId,
      route: input.route.path,
      tokenHash: hashToken(token),
      expiresAt,
      maxUses: input.route.maxUses,
    },
  });

  return { token, expiresAt, maxUses: input.route.maxUses };
}

export type GrantCheck =
  | { ok: true; grantId: string; remaining: number }
  | { ok: false; reason: "unknown" | "expired" | "exhausted" | "wrong_route" };

/**
 * Redeems one use of a grant.
 *
 * Looked up by hash, so the raw token never reaches a query log. The route is
 * checked as well as the token: a grant bought for the cheap search endpoint
 * must not open the expensive itinerary endpoint, and without this check the
 * price list would be advisory.
 */
export async function consumeGrant(token: string, routePath: string): Promise<GrantCheck> {
  const tokenHash = hashToken(token);
  const grant = await prisma.x402AccessGrant.findUnique({
    where: { tokenHash },
    select: { id: true, route: true, expiresAt: true, usedCount: true, maxUses: true },
  });

  if (!grant) return { ok: false, reason: "unknown" };
  if (grant.route !== routePath) return { ok: false, reason: "wrong_route" };
  if (grant.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (grant.maxUses > 0 && grant.usedCount >= grant.maxUses) {
    return { ok: false, reason: "exhausted" };
  }

  // The `usedCount` predicate is what makes this atomic: a concurrent caller
  // that already consumed the last use leaves this update matching zero rows.
  const consumed = await prisma.x402AccessGrant.updateMany({
    where: {
      id: grant.id,
      expiresAt: { gt: new Date() },
      ...(grant.maxUses > 0 ? { usedCount: { lt: grant.maxUses } } : {}),
    },
    data: { usedCount: { increment: 1 } },
  });

  if (consumed.count === 0) return { ok: false, reason: "exhausted" };

  return {
    ok: true,
    grantId: grant.id,
    remaining: grant.maxUses > 0 ? Math.max(0, grant.maxUses - grant.usedCount - 1) : -1,
  };
}

/**
 * Constant-time comparison for any place a token is compared directly.
 *
 * Not used by `consumeGrant`, which compares hashes through a unique index, but
 * exported so a future caller does not reach for `===` and reintroduce a timing
 * oracle.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
