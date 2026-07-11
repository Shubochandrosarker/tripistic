import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { isProviderEventUniqueViolation } from "@/lib/payments/webhook-service";

function p2002(target: string | string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

describe("isProviderEventUniqueViolation", () => {
  it("recognizes a P2002 violation on provider_event_id (array target, Postgres's usual shape)", () => {
    expect(isProviderEventUniqueViolation(p2002(["provider_event_id"]))).toBe(true);
  });

  it("recognizes a P2002 violation on provider_event_id (string target)", () => {
    expect(isProviderEventUniqueViolation(p2002("payment_events_provider_event_id_key"))).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isProviderEventUniqueViolation(p2002(["PROVIDER_EVENT_ID"]))).toBe(true);
  });

  it("rejects a P2002 violation on an unrelated constraint", () => {
    expect(isProviderEventUniqueViolation(p2002(["booking_reference_key"]))).toBe(false);
  });

  it("rejects a non-P2002 Prisma error", () => {
    const notFound = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(isProviderEventUniqueViolation(notFound)).toBe(false);
  });

  it("rejects an arbitrary non-Prisma error", () => {
    expect(isProviderEventUniqueViolation(new Error("boom"))).toBe(false);
    expect(isProviderEventUniqueViolation(null)).toBe(false);
    expect(isProviderEventUniqueViolation(undefined)).toBe(false);
  });
});
