import { z } from "zod";
import {
  AVAILABILITY_QUERY_MAX_DAYS,
  BOOKINGS_PAGE_SIZE_DEFAULT,
  BOOKINGS_PAGE_SIZE_MAX,
  BUSINESS_TYPES,
  CONSENT_STATUSES,
  CUSTOMERS_PAGE_SIZE_DEFAULT,
  CUSTOMERS_PAGE_SIZE_MAX,
  GUIDE_CERTIFICATIONS_MAX,
  MAX_PARTICIPANTS_PER_BOOKING,
  MAX_SIGNATURE_IMAGE_LENGTH,
  SETTING_KEYS,
  SLOT_GENERATION_DEFAULT_DAYS,
  SLOT_GENERATION_MAX_DAYS,
  TOUR_KINDS,
  TOUR_STATUSES,
  TOUR_VISIBILITIES,
  WAIVER_BODY_TEXT_MAX,
  WORKSPACE_ROLES,
} from "@/lib/constants";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

const countrySchema = z
  .union([z.string().trim().toUpperCase().length(2), z.literal(""), z.undefined(), z.null()])
  .transform((value) => (value ? value : undefined));

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True only if year/month/day form a real calendar date. `Date.UTC` silently
 * normalizes out-of-range values (e.g. month=13 rolls to the next year, day=31
 * in April rolls to May 1) instead of rejecting them, so validity is proven by
 * round-tripping the constructed date's fields back against the input.
 */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

/** Strict `YYYY-MM-DD` — rejects impossible dates like 2026-02-29 or 2026-02-31. */
const dateOnlySchema = z.string().regex(DATE_ONLY, "Use YYYY-MM-DD format").refine((value) => {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  return isValidCalendarDate(Number(y), Number(m), Number(d));
}, "Enter a real calendar date");

/** Safe IANA timezone check — accepts only identifiers the runtime's ICU data recognizes. */
export function isValidIanaTimezone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const ianaTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidIanaTimezone, "Enter a valid IANA timezone (e.g. America/Phoenix)");

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Workspace name is too short").max(80),
  businessType: z.enum(BUSINESS_TYPES),
  timezone: ianaTimezoneSchema.default("UTC"),
  currency: z.string().trim().toUpperCase().length(3, "Use a 3-letter currency code").default("USD"),
  country: countrySchema,
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    businessType: z.enum(BUSINESS_TYPES).optional(),
    timezone: ianaTimezoneSchema.optional(),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    country: countrySchema.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES);

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: workspaceRoleSchema,
});

export const updateMemberSchema = z.object({
  role: workspaceRoleSchema,
});

export const updateSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.enum(SETTING_KEYS),
        value: z.string().max(2000),
      }),
    )
    .min(1)
    .max(SETTING_KEYS.length),
});

/* ------------------------------------------------------------------------ */
/* Phase 2 — tours, schedules, availability, blackouts                       */
/* ------------------------------------------------------------------------ */

/** Optional text field: empty strings become undefined. */
function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );
}

/** Optional positive int arriving from a form (empty string/null → undefined). */
function optionalInt(min: number, max: number) {
  return z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(min).max(max).optional(),
  );
}

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createTourSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(120),
  kind: z.enum(TOUR_KINDS).default("tour"),
  description: optionalText(5000),
  durationMinutes: z.coerce.number().int().min(15, "At least 15 minutes").max(43200),
  durationDays: optionalInt(1, 60),
  location: optionalText(160),
  meetingPoint: optionalText(240),
  capacity: z.coerce.number().int().min(1).max(1000),
  basePrice: z.coerce.number().int().min(0).max(100_000_000),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  visibility: z.enum(TOUR_VISIBILITIES).default("public"),
  cancellationPolicy: optionalText(2000),
  cancellationNoticeHours: optionalInt(0, 720),
  waiverRequired: z.boolean().default(false),
  coverImageUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().url("Enter a valid URL").max(500).optional(),
  ),
});

export const updateTourSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    kind: z.enum(TOUR_KINDS).optional(),
    description: optionalText(5000),
    durationMinutes: optionalInt(15, 43200),
    durationDays: optionalInt(1, 60),
    location: optionalText(160),
    meetingPoint: optionalText(240),
    capacity: optionalInt(1, 1000),
    basePrice: optionalInt(0, 100_000_000),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    visibility: z.enum(TOUR_VISIBILITIES).optional(),
    status: z.enum(TOUR_STATUSES).optional(),
    cancellationPolicy: optionalText(2000),
    cancellationNoticeHours: optionalInt(0, 720),
    waiverRequired: z.boolean().optional(),
    coverImageUrl: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().url().max(500).optional(),
    ),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export type UpdateTourInput = z.infer<typeof updateTourSchema>;

export const addonSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: optionalText(500),
  price: z.coerce.number().int().min(0).max(100_000_000),
  maxPerBooking: optionalInt(1, 100),
  isActive: z.boolean().optional(),
});

export const updateAddonSchema = addonSchema
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

const daysOfWeekSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Pick at least one day")
  .max(7)
  .transform((days) => [...new Set(days)].sort());

export const createScheduleSchema = z
  .object({
    name: optionalText(80),
    daysOfWeek: daysOfWeekSchema,
    startTime: z.string().regex(TIME_HHMM, "Use HH:MM (24h) format"),
    durationMinutes: optionalInt(15, 43200),
    capacity: optionalInt(1, 1000),
    startsOn: dateOnlySchema,
    endsOn: dateOnlySchema.optional(),
  })
  .refine((data) => !data.endsOn || data.endsOn >= data.startsOn, {
    message: "End date must be on or after the start date",
    path: ["endsOn"],
  });

export const updateScheduleSchema = z
  .object({
    name: optionalText(80),
    daysOfWeek: daysOfWeekSchema.optional(),
    startTime: z.string().regex(TIME_HHMM).optional(),
    durationMinutes: optionalInt(15, 43200),
    capacity: optionalInt(1, 1000),
    startsOn: dateOnlySchema.optional(),
    endsOn: dateOnlySchema.optional().nullable(),
    status: z.enum(["active", "paused"]).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const generateSlotsSchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(SLOT_GENERATION_MAX_DAYS)
    .default(SLOT_GENERATION_DEFAULT_DAYS),
});

export const createAvailabilitySchema = z.object({
  startsAt: z.coerce.date().refine((date) => date.getTime() > Date.now(), {
    message: "Departure must be in the future",
  }),
  capacity: optionalInt(1, 1000),
  durationMinutes: optionalInt(15, 43200),
  priceOverride: optionalInt(0, 100_000_000),
  notes: optionalText(500),
  /** Eligibility (active member, not viewer) is re-verified server-side — see lib/guides/service.ts. */
  guideId: optionalText(64),
});

export const updateAvailabilitySchema = z
  .object({
    capacity: optionalInt(1, 1000),
    priceOverride: z.union([z.coerce.number().int().min(0).max(100_000_000), z.null()]).optional(),
    notes: optionalText(500),
    guideId: z.union([z.string().min(1).max(64), z.null()]).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const createBlackoutSchema = z
  .object({
    tourId: optionalText(64),
    startsOn: dateOnlySchema,
    endsOn: dateOnlySchema.optional(),
    reason: optionalText(200),
  })
  .refine((data) => !data.endsOn || data.endsOn >= data.startsOn, {
    message: "End date must be on or after the start date",
    path: ["endsOn"],
  });

/** Real ISO timestamp, coerced to `Date`; rejects malformed/unparseable input explicitly. */
const isoTimestampSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date/time")
  .transform((value) => new Date(value));

/**
 * Reusable `from`/`to` query-range validation for availability lookups
 * (internal and public). Both bounds are optional; when both are present,
 * `to` must not precede `from`, and the range may not exceed
 * `AVAILABILITY_QUERY_MAX_DAYS`. Invalid input must produce 400, never reach
 * Prisma as a raw unchecked `Date`.
 */
export const availabilityQuerySchema = z
  .object({
    from: isoTimestampSchema.optional(),
    to: isoTimestampSchema.optional(),
    partySize: optionalInt(1, 1000),
  })
  .refine((data) => !data.from || !data.to || data.to.getTime() >= data.from.getTime(), {
    message: "`to` must not be before `from`",
    path: ["to"],
  })
  .refine(
    (data) => {
      if (!data.from || !data.to) return true;
      const days = (data.to.getTime() - data.from.getTime()) / 86_400_000;
      return days <= AVAILABILITY_QUERY_MAX_DAYS;
    },
    { message: `Date range cannot exceed ${AVAILABILITY_QUERY_MAX_DAYS} days`, path: ["to"] },
  );

/* ------------------------------------------------------------------------ */
/* Phase 3 — bookings                                                        */
/* ------------------------------------------------------------------------ */

const nameSchema = z.string().trim().min(1, "Required").max(100);
const notesSchema = optionalText(1000);
const phoneSchema = optionalText(40);

const participantSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    emailSchema.optional(),
  ),
  phone: phoneSchema,
  notes: notesSchema,
});

const addonSelectionSchema = z.object({
  tourAddonId: z.string().trim().min(1).max(64),
  quantity: z.coerce.number().int().min(1).max(1000),
});

/**
 * Public booking request body. Deliberately does NOT declare a field for
 * price, total, currency, workspace ID, booked count, reference, public
 * token, or status — those are computed/assigned server-side only, so even a
 * malicious client that adds extra JSON keys can't influence them (Zod's
 * `.object()` strips unknown keys by default).
 */
export const publicBookingRequestSchema = z.object({
  availabilityId: z.string().trim().min(1).max(64),
  participantCount: z.coerce.number().int().min(1).max(MAX_PARTICIPANTS_PER_BOOKING),
  participants: z.array(participantSchema).min(1).max(MAX_PARTICIPANTS_PER_BOOKING),
  guestFirstName: nameSchema,
  guestLastName: nameSchema,
  guestEmail: emailSchema,
  guestPhone: phoneSchema,
  guestNotes: notesSchema,
  addons: z.array(addonSelectionSchema).max(50).default([]),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the cancellation policy and terms to book" }),
  }),
  idempotencyKey: z.string().uuid("Invalid idempotency key"),
  // Hidden honeypot field: real browsers never fill it in. Silently no-op
  // (not an error) so bots don't learn their submission was detected.
  website: z.string().max(200).optional(),
});

export type PublicBookingRequestInput = z.infer<typeof publicBookingRequestSchema>;

/** Authenticated manual booking — same shape plus operator-only controls. */
export const manualBookingRequestSchema = z.object({
  tourId: z.string().trim().min(1).max(64),
  availabilityId: z.string().trim().min(1).max(64),
  participantCount: z.coerce.number().int().min(1).max(MAX_PARTICIPANTS_PER_BOOKING),
  participants: z.array(participantSchema).min(1).max(MAX_PARTICIPANTS_PER_BOOKING),
  guestFirstName: nameSchema,
  guestLastName: nameSchema,
  guestEmail: emailSchema,
  guestPhone: phoneSchema,
  guestNotes: notesSchema,
  addons: z.array(addonSelectionSchema).max(50).default([]),
  status: z.enum(["pending", "confirmed"]).default("confirmed"),
  operatorNotes: optionalText(2000),
});

export type ManualBookingRequestInput = z.infer<typeof manualBookingRequestSchema>;

/** Limited, non-financial booking edit — cannot touch departure, party size, price, or add-ons. */
export const updateBookingSchema = z
  .object({
    guestFirstName: nameSchema.optional(),
    guestLastName: nameSchema.optional(),
    guestEmail: emailSchema.optional(),
    guestPhone: phoneSchema,
    guestNotes: notesSchema,
    operatorNotes: optionalText(2000),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const bookingStatusTransitionSchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]),
  note: optionalText(500),
});

export const bookingListQuerySchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]).optional(),
  source: z.enum(["public_direct", "manual"]).optional(),
  tourId: optionalText(64),
  /** Filters on the departure date (`departureStartsAt`), relative to now. */
  when: z.enum(["upcoming", "past", "all"]).default("all"),
  from: isoTimestampSchema.optional(),
  to: isoTimestampSchema.optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(BOOKINGS_PAGE_SIZE_MAX)
    .default(BOOKINGS_PAGE_SIZE_DEFAULT),
  sort: z.enum(["createdAt_desc", "createdAt_asc", "departure_asc", "departure_desc"]).default(
    "createdAt_desc",
  ),
});

/** Manual audit events accepted over the API (system events use the helper directly). */
export const manualAuditEventSchema = z.object({
  workspaceId: z.string().min(1),
  action: z.enum(["admin_action", "settings_updated", "billing_updated"]),
  entityType: z.string().trim().max(64).optional(),
  entityId: z.string().trim().max(64).optional(),
  metadata: z.record(z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
});

/* ------------------------------------------------------------------------ */
/* Phase 5 — CRM & communication                                             */
/* ------------------------------------------------------------------------ */

export const customerListQuerySchema = z.object({
  consentStatus: z.enum(CONSENT_STATUSES).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(CUSTOMERS_PAGE_SIZE_MAX).default(CUSTOMERS_PAGE_SIZE_DEFAULT),
});

/** Limited, operator-editable fields. `email` is the dedup key and is never editable after creation, same as a booking's departure/price. */
export const updateCustomerSchema = z
  .object({
    name: nameSchema.optional(),
    phone: optionalText(40),
    country: optionalText(2),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    consentStatus: z.enum(CONSENT_STATUSES).optional(),
    notes: optionalText(2000),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

/* ------------------------------------------------------------------------ */
/* Phase 6 — Guides & waivers                                               */
/* ------------------------------------------------------------------------ */

export const updateGuideProfileSchema = z
  .object({
    certifications: z.array(z.string().trim().min(1).max(80)).max(GUIDE_CERTIFICATIONS_MAX).optional(),
    notes: optionalText(2000),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const publishWaiverVersionSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(200),
  bodyText: z.string().trim().min(20, "Waiver text is too short").max(WAIVER_BODY_TEXT_MAX),
});

export const signWaiverSchema = z.object({
  participantId: z.string().trim().min(1).max(64),
  signerName: z.string().trim().min(2, "Enter the signer's full name").max(120),
  signatureImage: z.string().min(1).max(MAX_SIGNATURE_IMAGE_LENGTH),
});
