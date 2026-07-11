import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { generateUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/messaging/unsubscribe-token";

const ORIGINAL_SECRET = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-unsubscribe-token-unit-tests";
});

afterEach(() => {
  process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("unsubscribe token", () => {
  it("round-trips: a generated token verifies back to the same customer id", () => {
    const token = generateUnsubscribeToken("cust_abc123");
    expect(verifyUnsubscribeToken(token)).toBe("cust_abc123");
  });

  it("produces a different token for a different customer id", () => {
    const a = generateUnsubscribeToken("cust_a");
    const b = generateUnsubscribeToken("cust_b");
    expect(a).not.toBe(b);
  });

  it("rejects a token with a tampered signature", () => {
    const token = generateUnsubscribeToken("cust_abc123");
    const [idPart] = token.split(".");
    const tampered = `${idPart}.not-a-real-signature`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects a token forged for a different customer id by swapping the id part", () => {
    const tokenA = generateUnsubscribeToken("cust_a");
    const tokenB = generateUnsubscribeToken("cust_b");
    const [, signatureA] = tokenA.split(".");
    const [idPartB] = tokenB.split(".");
    // Attacker tries to claim customer B's id while reusing A's signature.
    const forged = `${idPartB}.${signatureA}`;
    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("not-a-token")).toBeNull();
    expect(verifyUnsubscribeToken("...")).toBeNull();
  });

  it("a token signed with a different secret does not verify against the current one", () => {
    const token = generateUnsubscribeToken("cust_abc123");
    process.env.AUTH_SECRET = "a-completely-different-secret-value";
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });
});
