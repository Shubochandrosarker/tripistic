import { describe, expect, it } from "vitest";

import { formatDateTimeInTz, formatDepartureInTz } from "@/lib/utils";

/**
 * docs/FINAL-LAUNCH-AUDIT.md §6.6 — the booking confirmation page formatted
 * the departure with no `timeZone`, so it rendered in whatever zone the
 * *server* happened to run in. A guest in Tokyo could be told a different
 * departure time than the operator sees on their own manifest, and the same
 * booking would display differently after a redeploy to another region.
 */

// 2026-03-14T17:00:00Z — deliberately an instant that lands on a different
// calendar day depending on the zone.
const DEPARTURE = new Date("2026-03-14T17:00:00.000Z");

describe("formatDepartureInTz", () => {
  it("renders the operator's wall time, not the server's", () => {
    const tokyo = formatDepartureInTz(DEPARTURE, "Asia/Tokyo");
    const newYork = formatDepartureInTz(DEPARTURE, "America/New_York");

    // 17:00 UTC is 02:00 the next day in Tokyo and 13:00 the same day in NY.
    expect(tokyo).toContain("March 15, 2026");
    expect(tokyo).toContain("2:00 AM");
    expect(newYork).toContain("March 14, 2026");
    expect(newYork).toContain("1:00 PM");
  });

  it("names the zone, because a bare clock time is ambiguous to a guest abroad", () => {
    expect(formatDepartureInTz(DEPARTURE, "America/New_York")).toMatch(/\bE[SD]T\b/);
    expect(formatDepartureInTz(DEPARTURE, "UTC")).toMatch(/UTC/);
  });

  it("differs from the unzoned formatting the page used to do", () => {
    // The pre-fix expression, reconstructed: no `timeZone`, so Intl falls back
    // to the runtime's own zone. Pick whichever zone is *not* the runtime's and
    // the two must disagree — that disagreement is precisely what a guest saw.
    const serverZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const elsewhere = serverZone === "Asia/Tokyo" ? "America/New_York" : "Asia/Tokyo";

    const preFix = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(DEPARTURE);

    expect(formatDepartureInTz(DEPARTURE, elsewhere)).not.toBe(preFix);
  });

  it("gives the same answer regardless of which zone the server runs in", () => {
    // An explicit `timeZone` makes the output a pure function of (instant,
    // zone). Formatting the same instant for the same zone through two
    // independently constructed formatters must therefore agree exactly.
    const direct = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/London",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(DEPARTURE);

    expect(formatDepartureInTz(DEPARTURE, "Europe/London")).toBe(direct);
  });

  it("degrades to a readable time instead of throwing on an unknown zone", () => {
    // Intl.DateTimeFormat throws a RangeError here. On the confirmation page
    // that would mean a guest who has just paid gets a 500 instead of their
    // booking, so the helper must absorb it.
    const result = formatDepartureInTz(DEPARTURE, "Mars/Olympus_Mons");
    expect(result).toContain("2026");
    expect(result).not.toBe("—");
  });

  it("returns a placeholder for a missing date rather than 'Invalid Date'", () => {
    expect(formatDepartureInTz(null, "UTC")).toBe("—");
    expect(formatDepartureInTz(undefined, "UTC")).toBe("—");
  });

  it("accepts an ISO string, which is what the serializer hands the page", () => {
    expect(formatDepartureInTz(DEPARTURE.toISOString(), "Asia/Tokyo")).toBe(
      formatDepartureInTz(DEPARTURE, "Asia/Tokyo"),
    );
  });
});

describe("confirmation page and email agree", () => {
  it("puts the departure on the same calendar day in both renderings", () => {
    // The page and the confirmation email use different formats but must never
    // disagree about *when* — that is the bug a guest actually notices.
    for (const zone of ["Asia/Tokyo", "America/New_York", "Europe/London", "UTC"]) {
      const page = formatDepartureInTz(DEPARTURE, zone);
      const email = formatDateTimeInTz(DEPARTURE, zone);
      const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, day: "numeric" }).format(
        DEPARTURE,
      );
      expect(page).toContain(`${day},`);
      expect(email).toContain(`${day},`);
    }
  });
});
