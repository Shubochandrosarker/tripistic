import { describe, expect, it } from "vitest";
import type { BookingStatus } from "@prisma/client";
import { canTransition, holdsCapacity, isTerminalStatus } from "@/lib/bookings/status";

const ALL_STATUSES: BookingStatus[] = ["pending", "confirmed", "cancelled", "completed", "no_show"];

const ALLOWED: Array<[BookingStatus, BookingStatus]> = [
  ["pending", "confirmed"],
  ["pending", "cancelled"],
  ["confirmed", "cancelled"],
  ["confirmed", "completed"],
  ["confirmed", "no_show"],
];

describe("booking status state machine — exhaustive transition matrix", () => {
  it.each(ALLOWED)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it("rejects every transition not explicitly allowed", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const isAllowed = ALLOWED.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to)).toBe(isAllowed);
      }
    }
  });

  it("no self-transitions are allowed (equality is handled separately as an idempotent no-op)", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("terminal statuses have no outgoing transitions", () => {
    for (const status of ["cancelled", "completed", "no_show"] as BookingStatus[]) {
      expect(isTerminalStatus(status)).toBe(true);
      for (const to of ALL_STATUSES) {
        expect(canTransition(status, to)).toBe(false);
      }
    }
  });

  it("pending and confirmed are not terminal", () => {
    expect(isTerminalStatus("pending")).toBe(false);
    expect(isTerminalStatus("confirmed")).toBe(false);
  });

  it("only pending and confirmed hold capacity", () => {
    expect(holdsCapacity("pending")).toBe(true);
    expect(holdsCapacity("confirmed")).toBe(true);
    expect(holdsCapacity("cancelled")).toBe(false);
    expect(holdsCapacity("completed")).toBe(false);
    expect(holdsCapacity("no_show")).toBe(false);
  });
});
