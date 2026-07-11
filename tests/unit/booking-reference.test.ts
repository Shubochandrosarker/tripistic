import { describe, expect, it } from "vitest";
import { generateBookingReference, generatePublicToken } from "@/lib/bookings/reference";

describe("generateBookingReference", () => {
  it("produces an 8-character reference from the safe alphabet only", () => {
    for (let i = 0; i < 200; i++) {
      const ref = generateBookingReference();
      expect(ref).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
    }
  });

  it("excludes visually ambiguous characters (0, O, 1, I, L)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateBookingReference()).not.toMatch(/[0O1IL]/);
    }
  });

  it("is not a predictable sequence — 500 draws produce (essentially) no duplicates", () => {
    const refs = new Set(Array.from({ length: 500 }, () => generateBookingReference()));
    expect(refs.size).toBe(500);
  });
});

describe("generatePublicToken", () => {
  it("produces a high-entropy, URL-safe token", () => {
    const token = generatePublicToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is unique across many draws", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generatePublicToken()));
    expect(tokens.size).toBe(500);
  });
});
