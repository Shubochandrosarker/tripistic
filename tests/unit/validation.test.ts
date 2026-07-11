import { describe, expect, it } from "vitest";
import {
  availabilityQuerySchema,
  createBlackoutSchema,
  createScheduleSchema,
  createWorkspaceSchema,
  isValidCalendarDate,
  isValidIanaTimezone,
  updateWorkspaceSchema,
} from "@/lib/validation";

describe("isValidCalendarDate", () => {
  it("accepts a valid leap-year date", () => {
    expect(isValidCalendarDate(2028, 2, 29)).toBe(true);
    expect(isValidCalendarDate(2000, 2, 29)).toBe(true); // divisible by 400
  });

  it("rejects Feb 29 in a non-leap year", () => {
    expect(isValidCalendarDate(2026, 2, 29)).toBe(false);
    expect(isValidCalendarDate(2100, 2, 29)).toBe(false); // divisible by 100, not 400
  });

  it("rejects a day past the month's end", () => {
    expect(isValidCalendarDate(2026, 2, 31)).toBe(false);
    expect(isValidCalendarDate(2026, 4, 31)).toBe(false);
    expect(isValidCalendarDate(2026, 4, 30)).toBe(true);
  });

  it("rejects an out-of-range month", () => {
    expect(isValidCalendarDate(2026, 13, 1)).toBe(false);
    expect(isValidCalendarDate(2026, 0, 1)).toBe(false);
  });

  it("rejects non-integer input", () => {
    expect(isValidCalendarDate(2026.5, 1, 1)).toBe(false);
    expect(isValidCalendarDate(2026, 1, Number.NaN)).toBe(false);
  });

  it("accepts an ordinary valid date", () => {
    expect(isValidCalendarDate(2026, 7, 15)).toBe(true);
  });
});

describe("dateOnlySchema (via createScheduleSchema/createBlackoutSchema)", () => {
  const validSchedule = {
    daysOfWeek: [1, 3],
    startTime: "09:00",
    startsOn: "2026-07-15",
  };

  it("accepts a well-formed, real calendar date", () => {
    expect(() => createScheduleSchema.parse(validSchedule)).not.toThrow();
  });

  it("rejects Feb 29 on a non-leap year", () => {
    expect(() =>
      createScheduleSchema.parse({ ...validSchedule, startsOn: "2026-02-29" }),
    ).toThrow();
  });

  it("rejects Feb 31 (impossible date)", () => {
    expect(() =>
      createBlackoutSchema.parse({ startsOn: "2026-02-31" }),
    ).toThrow();
  });

  it("rejects malformed formats", () => {
    for (const bad of ["2026-1-1", "2026/01/01", "26-01-01", "not-a-date", "", "2026-07-15T00:00:00Z"]) {
      expect(() => createBlackoutSchema.parse({ startsOn: bad }), bad).toThrow();
    }
  });

  it("accepts a leap-year Feb 29", () => {
    expect(() => createBlackoutSchema.parse({ startsOn: "2028-02-29" })).not.toThrow();
  });

  it("still enforces endsOn >= startsOn once both are valid dates", () => {
    expect(() =>
      createBlackoutSchema.parse({ startsOn: "2026-07-15", endsOn: "2026-07-10" }),
    ).toThrow();
    expect(() =>
      createBlackoutSchema.parse({ startsOn: "2026-07-15", endsOn: "2026-07-20" }),
    ).not.toThrow();
  });
});

describe("isValidIanaTimezone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidIanaTimezone("America/Phoenix")).toBe(true);
    expect(isValidIanaTimezone("UTC")).toBe(true);
    expect(isValidIanaTimezone("Europe/London")).toBe(true);
    expect(isValidIanaTimezone("Asia/Dhaka")).toBe(true);
  });

  it("rejects unknown or malformed zones", () => {
    expect(isValidIanaTimezone("Not/AZone")).toBe(false);
    expect(isValidIanaTimezone("Mars/Phobos")).toBe(false);
    expect(isValidIanaTimezone("")).toBe(false);
    expect(isValidIanaTimezone("America/Phoenix; DROP TABLE users")).toBe(false);
  });
});

describe("workspace timezone schema", () => {
  it("createWorkspaceSchema rejects an invalid timezone", () => {
    expect(() =>
      createWorkspaceSchema.parse({
        name: "Acme Tours",
        businessType: "solo_guide",
        timezone: "Not/AZone",
      }),
    ).toThrow();
  });

  it("createWorkspaceSchema accepts a valid timezone and defaults currency", () => {
    const parsed = createWorkspaceSchema.parse({
      name: "Acme Tours",
      businessType: "solo_guide",
      timezone: "America/Phoenix",
    });
    expect(parsed.timezone).toBe("America/Phoenix");
  });

  it("updateWorkspaceSchema rejects an invalid timezone", () => {
    expect(() => updateWorkspaceSchema.parse({ timezone: "Bogus/Zone" })).toThrow();
  });

  it("updateWorkspaceSchema accepts a valid timezone", () => {
    expect(() => updateWorkspaceSchema.parse({ timezone: "Pacific/Auckland" })).not.toThrow();
  });
});

describe("availabilityQuerySchema", () => {
  it("accepts an empty query", () => {
    expect(() => availabilityQuerySchema.parse({})).not.toThrow();
  });

  it("accepts a valid from/to range", () => {
    const parsed = availabilityQuerySchema.parse({
      from: "2026-07-15T00:00:00.000Z",
      to: "2026-08-15T00:00:00.000Z",
    });
    expect(parsed.from).toBeInstanceOf(Date);
    expect(parsed.to).toBeInstanceOf(Date);
  });

  it("rejects to < from", () => {
    expect(() =>
      availabilityQuerySchema.parse({
        from: "2026-07-15T00:00:00.000Z",
        to: "2026-07-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects a range wider than 365 days", () => {
    expect(() =>
      availabilityQuerySchema.parse({
        from: "2026-01-01T00:00:00.000Z",
        to: "2027-06-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects an unparseable date string", () => {
    expect(() => availabilityQuerySchema.parse({ from: "not-a-real-date" })).toThrow();
  });
});
