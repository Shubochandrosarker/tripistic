import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

import { DEFAULT_MAX_SKEW_SECONDS } from "@/lib/cloudflare/signatures";

/**
 * Nonce recording for signed service requests — the half of replay protection
 * that needs storage.
 *
 * `verifySignedRequest` proves a request is authentic and recent. This proves
 * it is the first time we have seen it.
 *
 * **Fails closed**, unlike the rate limiter, and the asymmetry is deliberate.
 * A rate limiter that fails open during a database outage over-serves some
 * requests; a replay check that fails open during the same outage accepts
 * every captured request an attacker has been saving up, at exactly the moment
 * nobody is watching the logs. Signed service calls are also low-volume and
 * machine-issued — a retry is free, whereas a duplicate `publishSite` or a
 * double-credited payment is not.
 */

export type NonceResult = { accepted: true } | { accepted: false; reason: "replayed" | "unavailable" };

/**
 * Records a nonce, or reports that it has been seen before.
 *
 * The insert *is* the check. Reading first and then writing would leave a
 * window in which two concurrent copies of the same replayed request both see
 * "not present" and both proceed; the primary key closes it in the database.
 */
export async function consumeNonce(
  nonce: string,
  purpose: string,
  ttlSeconds: number = DEFAULT_MAX_SKEW_SECONDS,
): Promise<NonceResult> {
  // Retained for the skew window plus a margin. Keeping them longer buys no
  // security — a request older than the window is already rejected on its
  // timestamp — and only grows the table.
  const expiresAt = new Date(Date.now() + (ttlSeconds + 60) * 1000);
  try {
    await prisma.serviceRequestNonce.create({ data: { nonce, purpose, expiresAt } });
    return { accepted: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      logger.warn("edge.nonce_replayed", { purpose });
      return { accepted: false, reason: "replayed" };
    }
    logger.error("edge.nonce_store_unavailable", { purpose }, error);
    return { accepted: false, reason: "unavailable" };
  }
}

/**
 * Deletes expired nonces. Registered as a background job rather than run
 * inline, so a signed request never pays for someone else's cleanup.
 */
export async function purgeExpiredNonces(now: Date = new Date()): Promise<number> {
  const result = await prisma.serviceRequestNonce.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}
