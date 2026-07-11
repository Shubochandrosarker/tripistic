import { createHmac, timingSafeEqual } from "node:crypto";

const PURPOSE = "unsubscribe:";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured — cannot sign an unsubscribe token.");
  return value;
}

function sign(customerId: string): string {
  return createHmac("sha256", secret()).update(PURPOSE + customerId).digest("base64url");
}

/**
 * Self-contained (no DB storage/expiry, unlike invitation tokens — an
 * unsubscribe request should always be honorable, indefinitely) and
 * unforgeable for a different customer id without knowing `AUTH_SECRET`.
 * The `unsubscribe:` prefix domain-separates this HMAC from any other use
 * of the same secret (NextAuth session signing).
 */
export function generateUnsubscribeToken(customerId: string): string {
  const id = Buffer.from(customerId, "utf8").toString("base64url");
  return `${id}.${sign(customerId)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex < 1) return null;
  const idPart = token.slice(0, separatorIndex);
  const signaturePart = token.slice(separatorIndex + 1);

  let customerId: string;
  try {
    customerId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!customerId) return null;

  const expected = sign(customerId);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signaturePart);
  if (expectedBuffer.length !== actualBuffer.length) return null;
  if (!timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  return customerId;
}
