/**
 * Request signing, Worker side.
 *
 * A deliberate, self-contained copy of the canonical form in
 * `lib/cloudflare/signatures.ts`. The Worker is a separate deployment artifact
 * with its own build and its own runtime; importing across that boundary would
 * mean bundling Node-targeted application code into an edge script.
 *
 * **The canonical string below must stay byte-identical to Core's.** Field
 * order is part of the signature, so reordering it here — even harmlessly, even
 * to read better — makes every request 401. `test/signing.test.ts` pins the
 * exact canonical string and a known-answer HMAC vector shared with
 * `tests/unit/edge-signatures.test.ts`, so a divergence fails a test instead of
 * taking every tenant site offline at the next deploy.
 */

export const SIGNATURE_VERSION = "v1";

export const SIGNATURE_HEADERS = {
  signature: "x-tripistic-signature",
  timestamp: "x-tripistic-timestamp",
  nonce: "x-tripistic-nonce",
  requestId: "x-tripistic-request-id",
  workspace: "x-tripistic-workspace",
} as const;

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

/**
 * The exact bytes that get signed.
 *
 * Mirrors `canonicalRequestString` in lib/cloudflare/signatures.ts:
 * version, method, path, timestamp, nonce, body hash, workspace.
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

export async function signRequest(input: {
  method: string;
  /** `pathname + search`, exactly as it will be sent. */
  path: string;
  body?: string;
  secret: string;
  requestId?: string;
  workspaceId?: string;
  timestampSeconds?: number;
  nonce?: string;
}): Promise<Record<string, string>> {
  const timestampSeconds = input.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const nonce = input.nonce ?? randomNonce();
  const bodyHash = await sha256Hex(input.body ?? "");

  const canonical = await canonicalRequestString({
    method: input.method,
    path: input.path,
    timestampSeconds,
    nonce,
    bodyHash,
    workspaceId: input.workspaceId,
  });

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(canonical)));

  const headers: Record<string, string> = {
    [SIGNATURE_HEADERS.signature]: `${SIGNATURE_VERSION}=${signature}`,
    [SIGNATURE_HEADERS.timestamp]: String(timestampSeconds),
    [SIGNATURE_HEADERS.nonce]: nonce,
    [SIGNATURE_HEADERS.requestId]: input.requestId ?? crypto.randomUUID(),
  };
  if (input.workspaceId) headers[SIGNATURE_HEADERS.workspace] = input.workspaceId;
  return headers;
}
