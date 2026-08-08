/**
 * Service-to-service request signing between Tripistic Core and Cloudflare
 * Workers.
 *
 * The threat this exists for: a tenant's published website runs as a Worker,
 * and that Worker needs live data — tour prices, availability, branding. If it
 * fetched an internal Tripistic endpoint with nothing but a shared bearer
 * token, then anyone who obtained that token (a leaked log line, a
 * mis-scoped environment variable, a compromised Worker) could read any
 * workspace's data by simply changing the `workspaceId` in the query string.
 * The V3 brief states the rule plainly: never trust `workspaceId`, `userId`,
 * `role`, `plan` or `subscription` because a Worker sent them.
 *
 * The scheme here gives three properties that a bearer token does not:
 *
 *   1. **Integrity** — the signature covers the method, the full path
 *      including query, and a hash of the body. Changing `?workspaceId=`
 *      invalidates it.
 *   2. **Freshness** — a timestamp outside the skew window is rejected, so a
 *      captured request stops working within minutes.
 *   3. **Single use** — a nonce, recorded by the verifier, so a request
 *      captured inside the window still cannot be replayed.
 *
 * It is *not* an authorization decision. A valid signature proves "this came
 * from something holding the signing secret, unmodified, recently, once". The
 * caller still has to resolve what that principal is allowed to see, which is
 * why `verifySignedRequest` returns the claimed scope rather than accepting
 * it.
 *
 * Implementation note: Web Crypto only, no Node built-ins. This file has to
 * run unchanged inside a Worker (where `node:crypto` is not available by
 * default) as well as in the Next.js Node runtime. That constraint is why the
 * hex helpers are hand-rolled rather than using `Buffer`.
 */

export const SIGNATURE_VERSION = "v1";

export const SIGNATURE_HEADERS = {
  signature: "x-tripistic-signature",
  timestamp: "x-tripistic-timestamp",
  nonce: "x-tripistic-nonce",
  requestId: "x-tripistic-request-id",
  keyId: "x-tripistic-key-id",
  /**
   * The scope the caller *claims*. Signed, so it cannot be altered in flight,
   * but still only a claim: the verifier's caller decides whether the
   * principal that holds the signing key may act on that workspace.
   */
  workspace: "x-tripistic-workspace",
} as const;

/** Seconds either side of `now` that a timestamp is accepted. */
export const DEFAULT_MAX_SKEW_SECONDS = 300;

export type SignedRequestScope = {
  /** Workspace the caller claims to act for. Absent for platform-wide calls. */
  workspaceId?: string;
  /** Which signing key was used, so keys can be rotated without a flag day. */
  keyId?: string;
};

export type SignRequestInput = {
  method: string;
  /** Path plus query, e.g. `/api/edge/sites/abc?revision=3`. Not the origin. */
  path: string;
  body?: string;
  secret: string;
  timestampSeconds?: number;
  nonce?: string;
  requestId?: string;
  scope?: SignedRequestScope;
};

export type VerifyRequestInput = {
  method: string;
  path: string;
  body?: string;
  headers: Headers | Record<string, string | undefined>;
  secret: string;
  nowSeconds?: number;
  maxSkewSeconds?: number;
};

export type VerificationSuccess = {
  ok: true;
  nonce: string;
  requestId: string;
  timestampSeconds: number;
  scope: SignedRequestScope;
};

export type VerificationFailureReason =
  | "missing_signature"
  | "missing_timestamp"
  | "missing_nonce"
  | "malformed_timestamp"
  | "expired"
  | "future"
  | "unsupported_version"
  | "invalid_signature";

export type VerificationFailure = { ok: false; reason: VerificationFailureReason };

export type VerificationResult = VerificationSuccess | VerificationFailure;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * The exact bytes that get signed.
 *
 * Newline-delimited with a fixed field order and a leading version tag. The
 * version tag is what makes the scheme changeable later: a `v2` canonical
 * string cannot be confused with a `v1` one even if an attacker replays the
 * signature, because the tag is inside the signed material as well as beside
 * it.
 *
 * The body is included as a hash rather than inline so that signing a large
 * upload does not mean holding it twice in memory, and so the same function
 * works for a streamed body whose digest was computed on the way past.
 */
export async function canonicalRequestString(input: {
  method: string;
  path: string;
  timestampSeconds: number;
  nonce: string;
  bodyHash: string;
  workspaceId?: string;
}): Promise<string> {
  return [
    SIGNATURE_VERSION,
    input.method.toUpperCase(),
    input.path,
    String(input.timestampSeconds),
    input.nonce,
    input.bodyHash,
    input.workspaceId ?? "",
  ].join("\n");
}

export function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export async function signRequest(input: SignRequestInput): Promise<Record<string, string>> {
  const timestampSeconds = input.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const nonce = input.nonce ?? randomNonce();
  const requestId = input.requestId ?? crypto.randomUUID();
  const bodyHash = await sha256Hex(input.body ?? "");

  const canonical = await canonicalRequestString({
    method: input.method,
    path: input.path,
    timestampSeconds,
    nonce,
    bodyHash,
    workspaceId: input.scope?.workspaceId,
  });

  const signature = toHex(
    await crypto.subtle.sign("HMAC", await hmacKey(input.secret), encoder.encode(canonical)),
  );

  const headers: Record<string, string> = {
    [SIGNATURE_HEADERS.signature]: `${SIGNATURE_VERSION}=${signature}`,
    [SIGNATURE_HEADERS.timestamp]: String(timestampSeconds),
    [SIGNATURE_HEADERS.nonce]: nonce,
    [SIGNATURE_HEADERS.requestId]: requestId,
  };
  if (input.scope?.workspaceId) headers[SIGNATURE_HEADERS.workspace] = input.scope.workspaceId;
  if (input.scope?.keyId) headers[SIGNATURE_HEADERS.keyId] = input.scope.keyId;
  return headers;
}

function readHeader(
  headers: Headers | Record<string, string | undefined>,
  name: string,
): string | undefined {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const record = headers as Record<string, string | undefined>;
  return record[name] ?? record[name.toLowerCase()] ?? undefined;
}

/**
 * Length-independent, value-independent comparison.
 *
 * `a === b` on hex strings leaks how many leading characters matched through
 * timing. That is a real attack against a signature check given enough
 * samples, and the fix costs nothing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  // Compare lengths without an early return, then fold the result in.
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Verifies signature, version, and freshness.
 *
 * Deliberately does **not** check the nonce against a store: that needs
 * persistence, which would drag a database dependency into a file that has to
 * run inside a Worker. The nonce is returned instead, and
 * `lib/cloudflare/replay.ts` records it on the Tripistic side. Splitting it
 * this way also keeps this function pure and therefore exhaustively testable.
 */
export async function verifySignedRequest(input: VerifyRequestInput): Promise<VerificationResult> {
  const provided = readHeader(input.headers, SIGNATURE_HEADERS.signature);
  if (!provided) return { ok: false, reason: "missing_signature" };

  const rawTimestamp = readHeader(input.headers, SIGNATURE_HEADERS.timestamp);
  if (!rawTimestamp) return { ok: false, reason: "missing_timestamp" };

  const nonce = readHeader(input.headers, SIGNATURE_HEADERS.nonce);
  if (!nonce) return { ok: false, reason: "missing_nonce" };

  const [version, signature] = provided.split("=", 2);
  if (version !== SIGNATURE_VERSION || !signature) {
    return { ok: false, reason: "unsupported_version" };
  }

  const timestampSeconds = Number.parseInt(rawTimestamp, 10);
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: "malformed_timestamp" };

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = input.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS;
  if (now - timestampSeconds > skew) return { ok: false, reason: "expired" };
  // A timestamp in the future is rejected too. Allowing it would let a caller
  // mint a signature that stays valid for as long as they like.
  if (timestampSeconds - now > skew) return { ok: false, reason: "future" };

  const workspaceId = readHeader(input.headers, SIGNATURE_HEADERS.workspace);
  const canonical = await canonicalRequestString({
    method: input.method,
    path: input.path,
    timestampSeconds,
    nonce,
    bodyHash: await sha256Hex(input.body ?? ""),
    workspaceId,
  });

  const expected = toHex(
    await crypto.subtle.sign("HMAC", await hmacKey(input.secret), encoder.encode(canonical)),
  );
  if (!timingSafeEqual(expected, signature)) return { ok: false, reason: "invalid_signature" };

  return {
    ok: true,
    nonce,
    requestId: readHeader(input.headers, SIGNATURE_HEADERS.requestId) ?? "",
    timestampSeconds,
    scope: {
      workspaceId: workspaceId || undefined,
      keyId: readHeader(input.headers, SIGNATURE_HEADERS.keyId) || undefined,
    },
  };
}
