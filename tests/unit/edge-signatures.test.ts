import { describe, expect, it } from "vitest";

import {
  SIGNATURE_HEADERS,
  canonicalRequestString,
  signRequest,
  timingSafeEqual,
  verifySignedRequest,
} from "@/lib/cloudflare/signatures";

const SECRET = "test-worker-signing-secret-at-least-32-chars";
const OTHER_SECRET = "a-different-worker-signing-secret-32-chars";

async function sign(overrides: Partial<Parameters<typeof signRequest>[0]> = {}) {
  return signRequest({
    method: "POST",
    path: "/api/edge/sites/site_1?revision=3",
    body: JSON.stringify({ hello: "world" }),
    secret: SECRET,
    scope: { workspaceId: "ws_alpha" },
    ...overrides,
  });
}

function verify(
  headers: Record<string, string>,
  overrides: Partial<Parameters<typeof verifySignedRequest>[0]> = {},
) {
  return verifySignedRequest({
    method: "POST",
    path: "/api/edge/sites/site_1?revision=3",
    body: JSON.stringify({ hello: "world" }),
    headers,
    secret: SECRET,
    ...overrides,
  });
}

describe("edge request signing", () => {
  it("verifies a signature it just produced", async () => {
    const result = await verify(await sign());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.workspaceId).toBe("ws_alpha");
      expect(result.nonce).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("is deterministic for identical inputs", async () => {
    const fixed = { timestampSeconds: 1_800_000_000, nonce: "a".repeat(32) };
    const first = await sign(fixed);
    const second = await sign(fixed);
    expect(first[SIGNATURE_HEADERS.signature]).toBe(second[SIGNATURE_HEADERS.signature]);
  });

  it("rejects a signature made with a different secret", async () => {
    const headers = await sign({ secret: OTHER_SECRET });
    const result = await verify(headers);
    expect(result).toEqual({ ok: false, reason: "invalid_signature" });
  });

  /**
   * The core property. The whole scheme exists so that a Worker cannot change
   * which workspace it is asking about, whichever part of the request it
   * changes it in.
   */
  describe("tamper detection", () => {
    it("rejects a changed workspace header", async () => {
      const headers = await sign();
      headers[SIGNATURE_HEADERS.workspace] = "ws_victim";
      expect(await verify(headers)).toEqual({ ok: false, reason: "invalid_signature" });
    });

    it("rejects a changed query string", async () => {
      const headers = await sign();
      const result = await verify(headers, { path: "/api/edge/sites/site_1?revision=9" });
      expect(result).toEqual({ ok: false, reason: "invalid_signature" });
    });

    it("rejects a changed path", async () => {
      const headers = await sign();
      const result = await verify(headers, { path: "/api/edge/sites/site_2?revision=3" });
      expect(result).toEqual({ ok: false, reason: "invalid_signature" });
    });

    it("rejects a changed method", async () => {
      const headers = await sign();
      expect(await verify(headers, { method: "DELETE" })).toEqual({
        ok: false,
        reason: "invalid_signature",
      });
    });

    it("rejects a changed body", async () => {
      const headers = await sign();
      const result = await verify(headers, { body: JSON.stringify({ hello: "tampered" }) });
      expect(result).toEqual({ ok: false, reason: "invalid_signature" });
    });

    it("rejects a changed nonce", async () => {
      const headers = await sign();
      headers[SIGNATURE_HEADERS.nonce] = "b".repeat(32);
      expect(await verify(headers)).toEqual({ ok: false, reason: "invalid_signature" });
    });
  });

  describe("freshness", () => {
    it("rejects a timestamp older than the skew window", async () => {
      const headers = await sign({ timestampSeconds: 1_800_000_000 });
      const result = await verify(headers, { nowSeconds: 1_800_000_000 + 301 });
      expect(result).toEqual({ ok: false, reason: "expired" });
    });

    it("accepts a timestamp inside the skew window", async () => {
      const headers = await sign({ timestampSeconds: 1_800_000_000 });
      const result = await verify(headers, { nowSeconds: 1_800_000_000 + 299 });
      expect(result.ok).toBe(true);
    });

    /**
     * A future timestamp is rejected too. Allowing it would let a caller mint
     * one signature dated a year out and reuse it indefinitely — the freshness
     * check would pass every time.
     */
    it("rejects a timestamp far in the future", async () => {
      const headers = await sign({ timestampSeconds: 1_800_000_000 + 4000 });
      const result = await verify(headers, { nowSeconds: 1_800_000_000 });
      expect(result).toEqual({ ok: false, reason: "future" });
    });
  });

  describe("malformed input", () => {
    it("rejects a missing signature", async () => {
      const headers = await sign();
      delete headers[SIGNATURE_HEADERS.signature];
      expect(await verify(headers)).toEqual({ ok: false, reason: "missing_signature" });
    });

    it("rejects a missing nonce", async () => {
      const headers = await sign();
      delete headers[SIGNATURE_HEADERS.nonce];
      expect(await verify(headers)).toEqual({ ok: false, reason: "missing_nonce" });
    });

    it("rejects a missing timestamp", async () => {
      const headers = await sign();
      delete headers[SIGNATURE_HEADERS.timestamp];
      expect(await verify(headers)).toEqual({ ok: false, reason: "missing_timestamp" });
    });

    it("rejects a non-numeric timestamp", async () => {
      const headers = await sign();
      headers[SIGNATURE_HEADERS.timestamp] = "tomorrow";
      expect(await verify(headers)).toEqual({ ok: false, reason: "malformed_timestamp" });
    });

    it("rejects an unknown signature version", async () => {
      const headers = await sign();
      headers[SIGNATURE_HEADERS.signature] = headers[SIGNATURE_HEADERS.signature].replace(
        "v1=",
        "v2=",
      );
      expect(await verify(headers)).toEqual({ ok: false, reason: "unsupported_version" });
    });
  });

  it("reads headers from a Headers instance as well as a plain object", async () => {
    const headers = new Headers(await sign());
    const result = await verify(headers as unknown as Record<string, string>);
    expect(result.ok).toBe(true);
  });

  it("binds the workspace into the canonical string", async () => {
    const base = {
      method: "GET",
      path: "/x",
      timestampSeconds: 1,
      nonce: "n",
      bodyHash: "h",
    };
    const withWorkspace = await canonicalRequestString({ ...base, workspaceId: "ws_a" });
    const withoutWorkspace = await canonicalRequestString(base);
    expect(withWorkspace).not.toBe(withoutWorkspace);
  });
});

describe("timingSafeEqual", () => {
  it("matches identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("rejects strings of different length", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("rejects strings differing only in the last character", () => {
    expect(timingSafeEqual("abcdef", "abcdeg")).toBe(false);
  });

  it("rejects the empty-vs-nonempty case", () => {
    expect(timingSafeEqual("", "a")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
