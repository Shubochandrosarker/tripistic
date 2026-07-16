import { z } from "zod";
import {
  AVAILABILITY_QUERY_MAX_DAYS,
  BOOKINGS_PAGE_SIZE_DEFAULT,
  BOOKINGS_PAGE_SIZE_MAX,
  BUSINESS_TYPES,
  COMPANIES_PAGE_SIZE_DEFAULT,
  COMPANIES_PAGE_SIZE_MAX,
  COMPANY_KINDS,
  CONSENT_STATUSES,
  CRM_ACTIVITY_TYPES,
  CRM_TASKS_PAGE_SIZE_DEFAULT,
  CRM_TASKS_PAGE_SIZE_MAX,
  CRM_TASK_STATUSES,
  CRM_TIMELINE_PAGE_SIZE_DEFAULT,
  CRM_TIMELINE_PAGE_SIZE_MAX,
  CUSTOMERS_PAGE_SIZE_DEFAULT,
  CUSTOMERS_PAGE_SIZE_MAX,
  GUIDE_CERTIFICATIONS_MAX,
  GUIDE_KINDS,
  INCIDENTS_PAGE_SIZE_DEFAULT,
  INCIDENTS_PAGE_SIZE_MAX,
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  ITINERARIES_PAGE_SIZE_DEFAULT,
  ITINERARIES_PAGE_SIZE_MAX,
  ITINERARY_ITEM_TYPES,
  ITINERARY_MAX_DAYS,
  ITINERARY_MAX_TRAVELERS,
  ITINERARY_STATUSES,
  LEADS_PAGE_SIZE_DEFAULT,
  LEADS_PAGE_SIZE_MAX,
  LEAD_STATUSES,
  MAINTENANCE_TYPES,
  MAX_PARTICIPANTS_PER_BOOKING,
  MAX_SIGNATURE_IMAGE_LENGTH,
  OPS_STATUSES,
  SETTING_KEYS,
  SLOT_GENERATION_DEFAULT_DAYS,
  SLOT_GENERATION_MAX_DAYS,
  STAFF_EMPLOYMENT_TYPES,
  STAFF_LANGUAGES_MAX,
  STAFF_SKILLS_MAX,
  STAFF_TIME_ENTRY_MAX_MINUTES,
  TIME_OFF_STATUSES,
  TOUR_KINDS,
  TOUR_STATUSES,
  TOUR_VISIBILITIES,
  VEHICLES_PAGE_SIZE_DEFAULT,
  VEHICLES_PAGE_SIZE_MAX,
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
  VENDOR_INVOICES_PAGE_SIZE_DEFAULT,
  VENDOR_INVOICES_PAGE_SIZE_MAX,
  VENDOR_INVOICE_STATUSES,
  VENDORS_PAGE_SIZE_DEFAULT,
  VENDORS_PAGE_SIZE_MAX,
  VENDOR_KINDS,
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
  /** Phase 6 (extended): driver, separate from guideId. Same eligibility re-check. */
  driverId: optionalText(64),
  /** Phase 7: vehicle assignment. Existence/status re-verified server-side — see lib/vehicles/service.ts. */
  vehicleId: optionalText(64),
});

export const updateAvailabilitySchema = z
  .object({
    capacity: optionalInt(1, 1000),
    priceOverride: z.union([z.coerce.number().int().min(0).max(100_000_000), z.null()]).optional(),
    notes: optionalText(500),
    guideId: z.union([z.string().min(1).max(64), z.null()]).optional(),
    /** Phase 6 (extended): driver, separate from guideId. */
    driverId: z.union([z.string().min(1).max(64), z.null()]).optional(),
    /** Phase 7: vehicle assignment. */
    vehicleId: z.union([z.string().min(1).max(64), z.null()]).optional(),
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

export const publishWaiverVersionSchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(200),
  bodyText: z.string().trim().min(20, "Waiver text is too short").max(WAIVER_BODY_TEXT_MAX),
});

export const signWaiverSchema = z.object({
  participantId: z.string().trim().min(1).max(64),
  signerName: z.string().trim().min(2, "Enter the signer's full name").max(120),
  signatureImage: z.string().min(1).max(MAX_SIGNATURE_IMAGE_LENGTH),
});

/* ------------------------------------------------------------------------ */
/* Phase 5 (extended) — CRM: companies, leads, tasks, activity timeline     */
/* ------------------------------------------------------------------------ */

const moneyCentsSchema = z.coerce.number().int().min(0).max(100_000_000);

export const companySchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  kind: z.enum(COMPANY_KINDS).default("other"),
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    emailSchema.optional(),
  ),
  phone: phoneSchema,
  website: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().url("Enter a valid URL").max(300).optional(),
  ),
  country: countrySchema,
  commissionRateBps: optionalInt(0, 10_000),
  notes: optionalText(2000),
});

export const updateCompanySchema = companySchema
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const companyListQuerySchema = z.object({
  kind: z.enum(COMPANY_KINDS).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(COMPANIES_PAGE_SIZE_MAX).default(COMPANIES_PAGE_SIZE_DEFAULT),
});

export const createLeadSchema = z.object({
  name: nameSchema,
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    emailSchema.optional(),
  ),
  phone: phoneSchema,
  companyId: optionalText(64),
  source: optionalText(80),
  status: z.enum(LEAD_STATUSES).default("new"),
  estimatedValueCents: optionalInt(0, 100_000_000),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  notes: optionalText(2000),
  assignedToId: optionalText(64),
});

export const updateLeadSchema = z
  .object({
    name: nameSchema.optional(),
    email: z.union([emailSchema, z.null()]).optional(),
    phone: z.union([z.string().trim().max(40), z.null()]).optional(),
    companyId: z.union([z.string().min(1).max(64), z.null()]).optional(),
    source: optionalText(80),
    status: z.enum(LEAD_STATUSES).optional(),
    estimatedValueCents: z.union([moneyCentsSchema, z.null()]).optional(),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    notes: optionalText(2000),
    assignedToId: z.union([z.string().min(1).max(64), z.null()]).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const leadListQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(LEADS_PAGE_SIZE_MAX).default(LEADS_PAGE_SIZE_DEFAULT),
});

/** Converts a lead into a Customer — see lib/crm/leads.ts `convertLead`. No body: the lead's own fields drive the new/matched customer. */
export const convertLeadSchema = z.object({
  bookingNote: optionalText(500),
});

export const crmTaskSchema = z
  .object({
    title: z.string().trim().min(2, "Title is too short").max(200),
    description: optionalText(2000),
    dueAt: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      isoTimestampSchema.optional(),
    ),
    customerId: optionalText(64),
    leadId: optionalText(64),
    assignedToId: optionalText(64),
  })
  .refine((data) => !(data.customerId && data.leadId), {
    message: "Link a task to a customer or a lead, not both",
    path: ["leadId"],
  });

export const updateCrmTaskSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: optionalText(2000),
    dueAt: z.union([isoTimestampSchema, z.null()]).optional(),
    status: z.enum(CRM_TASK_STATUSES).optional(),
    assignedToId: z.union([z.string().min(1).max(64), z.null()]).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const crmTaskListQuerySchema = z.object({
  status: z.enum(CRM_TASK_STATUSES).optional(),
  assignedToId: optionalText(64),
  customerId: optionalText(64),
  leadId: optionalText(64),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(CRM_TASKS_PAGE_SIZE_MAX).default(CRM_TASKS_PAGE_SIZE_DEFAULT),
});

export const crmActivitySchema = z
  .object({
    customerId: optionalText(64),
    leadId: optionalText(64),
    type: z.enum(CRM_ACTIVITY_TYPES).default("note"),
    subject: optionalText(200),
    body: optionalText(5000),
    occurredAt: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      isoTimestampSchema.optional(),
    ),
  })
  .refine((data) => Boolean(data.customerId) !== Boolean(data.leadId), {
    message: "Link an activity to exactly one customer or lead",
    path: ["leadId"],
  });

export const crmTimelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(CRM_TIMELINE_PAGE_SIZE_MAX)
    .default(CRM_TIMELINE_PAGE_SIZE_DEFAULT),
});

/* ------------------------------------------------------------------------ */
/* Phase 6 (extended) — Workforce management                                */
/* ------------------------------------------------------------------------ */

export const updateWorkforceProfileSchema = z
  .object({
    certifications: z.array(z.string().trim().min(1).max(80)).max(GUIDE_CERTIFICATIONS_MAX).optional(),
    notes: optionalText(2000),
    kind: z.enum(GUIDE_KINDS).optional(),
    languages: z.array(z.string().trim().min(1).max(40)).max(STAFF_LANGUAGES_MAX).optional(),
    skills: z.array(z.string().trim().min(1).max(60)).max(STAFF_SKILLS_MAX).optional(),
    employmentType: z.enum(STAFF_EMPLOYMENT_TYPES).optional(),
    phone: phoneSchema,
    hourlyRateCents: z.union([moneyCentsSchema, z.null()]).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const createTimeOffSchema = z
  .object({
    startsOn: dateOnlySchema,
    endsOn: dateOnlySchema,
    reason: optionalText(300),
    status: z.enum(TIME_OFF_STATUSES).default("requested"),
  })
  .refine((data) => data.endsOn >= data.startsOn, {
    message: "End date must be on or after the start date",
    path: ["endsOn"],
  });

export const updateTimeOffSchema = z.object({
  status: z.enum(TIME_OFF_STATUSES),
});

export const createTimeEntrySchema = z.object({
  workedOn: dateOnlySchema,
  minutes: z.coerce.number().int().min(1).max(STAFF_TIME_ENTRY_MAX_MINUTES),
  availabilityId: optionalText(64),
  role: optionalText(80),
  note: optionalText(500),
});

export const createGuideRatingSchema = z.object({
  ratingValue: z.coerce.number().int().min(1).max(5),
  availabilityId: optionalText(64),
  comment: optionalText(1000),
});

/** Inputs for the AI guide/driver matching engine (lib/workforce/matching.ts). */
export const matchStaffQuerySchema = z.object({
  availabilityId: z.string().trim().min(1).max(64),
  role: z.enum(["guide", "driver"]).default("guide"),
  languages: z
    .preprocess(
      (value) => (typeof value === "string" ? value.split(",").map((v) => v.trim()).filter(Boolean) : value),
      z.array(z.string().trim().min(1).max(40)).max(STAFF_LANGUAGES_MAX).optional(),
    ),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

/* ------------------------------------------------------------------------ */
/* Phase 7 — Vehicle management                                             */
/* ------------------------------------------------------------------------ */

export const vehicleSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  type: z.enum(VEHICLE_TYPES).default("car"),
  licensePlate: optionalText(20),
  capacity: z.coerce.number().int().min(1).max(500),
  status: z.enum(VEHICLE_STATUSES).default("active"),
  odometer: optionalInt(0, 10_000_000),
  fuelType: optionalText(40),
  insuranceExpiresOn: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    dateOnlySchema.optional(),
  ),
  registrationExpiresOn: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    dateOnlySchema.optional(),
  ),
  notes: optionalText(2000),
});

export const updateVehicleSchema = vehicleSchema
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const vehicleListQuerySchema = z.object({
  status: z.enum(VEHICLE_STATUSES).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(VEHICLES_PAGE_SIZE_MAX).default(VEHICLES_PAGE_SIZE_DEFAULT),
});

export const createMaintenanceRecordSchema = z.object({
  type: z.enum(MAINTENANCE_TYPES).default("service"),
  performedOn: dateOnlySchema,
  odometer: optionalInt(0, 10_000_000),
  costCents: optionalInt(0, 100_000_000),
  vendorName: optionalText(120),
  notes: optionalText(1000),
  nextDueOn: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    dateOnlySchema.optional(),
  ),
});

export const createFuelLogSchema = z.object({
  loggedOn: dateOnlySchema,
  costCents: z.coerce.number().int().min(0).max(100_000_000),
  odometer: optionalInt(0, 10_000_000),
  notes: optionalText(500),
});

/* ------------------------------------------------------------------------ */
/* Phase 8/9 — Operations Center & Dispatch Center                          */
/* ------------------------------------------------------------------------ */

export const opsStatusTransitionSchema = z.object({
  status: z.enum(OPS_STATUSES),
  delayMinutes: optionalInt(0, 1440),
  message: optionalText(500),
  /** When true and the new status is `delayed`, queues a guest-notification message (see lib/operations/service.ts). */
  notifyGuests: z.boolean().default(false),
});

export const createOpsNoteSchema = z.object({
  message: z.string().trim().min(1, "Enter a note").max(2000),
});

export const assignDeparturePartySchema = z
  .object({
    guideId: z.union([z.string().min(1).max(64), z.null()]).optional(),
    driverId: z.union([z.string().min(1).max(64), z.null()]).optional(),
    vehicleId: z.union([z.string().min(1).max(64), z.null()]).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const opsBoardQuerySchema = z.object({
  date: dateOnlySchema.optional(),
});

export const createIncidentSchema = z.object({
  availabilityId: optionalText(64),
  severity: z.enum(INCIDENT_SEVERITIES).default("medium"),
  category: z.enum(INCIDENT_CATEGORIES).default("other"),
  description: z.string().trim().min(5, "Describe what happened").max(4000),
});

export const updateIncidentSchema = z
  .object({
    severity: z.enum(INCIDENT_SEVERITIES).optional(),
    category: z.enum(INCIDENT_CATEGORIES).optional(),
    status: z.enum(INCIDENT_STATUSES).optional(),
    description: z.string().trim().min(5).max(4000).optional(),
    resolutionNotes: optionalText(4000),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const incidentListQuerySchema = z.object({
  status: z.enum(INCIDENT_STATUSES).optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(INCIDENTS_PAGE_SIZE_MAX).default(INCIDENTS_PAGE_SIZE_DEFAULT),
});

/* ------------------------------------------------------------------------ */
/* Phase 10 — Vendor management                                             */
/* ------------------------------------------------------------------------ */

export const vendorSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  kind: z.enum(VENDOR_KINDS).default("other"),
  contactName: optionalText(120),
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    emailSchema.optional(),
  ),
  phone: phoneSchema,
  country: countrySchema,
  commissionRateBps: optionalInt(0, 10_000),
  rating: optionalInt(1, 5),
  isActive: z.boolean().default(true),
  notes: optionalText(2000),
});

export const updateVendorSchema = vendorSchema
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const vendorListQuerySchema = z.object({
  kind: z.enum(VENDOR_KINDS).optional(),
  isActive: z.preprocess((v) => (v === "true" ? true : v === "false" ? false : undefined), z.boolean().optional()),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(VENDORS_PAGE_SIZE_MAX).default(VENDORS_PAGE_SIZE_DEFAULT),
});

export const createVendorInvoiceSchema = z.object({
  invoiceNumber: optionalText(80),
  amountCents: z.coerce.number().int().min(0).max(100_000_000),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  issuedOn: dateOnlySchema,
  dueOn: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    dateOnlySchema.optional(),
  ),
  notes: optionalText(1000),
});

export const updateVendorInvoiceSchema = z
  .object({
    status: z.enum(VENDOR_INVOICE_STATUSES).optional(),
    dueOn: z.union([dateOnlySchema, z.null()]).optional(),
    notes: optionalText(1000),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const vendorInvoiceListQuerySchema = z.object({
  status: z.enum(VENDOR_INVOICE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(VENDOR_INVOICES_PAGE_SIZE_MAX)
    .default(VENDOR_INVOICES_PAGE_SIZE_DEFAULT),
});

/* ------------------------------------------------------------------------ */
/* Phase 11 — AI Itinerary Builder                                          */
/* ------------------------------------------------------------------------ */

export const generateItinerarySchema = z.object({
  title: z.string().trim().min(2, "Title is too short").max(160),
  destination: optionalText(160),
  dayCount: z.coerce.number().int().min(1).max(ITINERARY_MAX_DAYS),
  startDate: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    dateOnlySchema.optional(),
  ),
  travelerCount: optionalInt(1, ITINERARY_MAX_TRAVELERS),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  customerId: optionalText(64),
  leadId: optionalText(64),
  /** Rough per-traveler-per-day budget tier — steers the rule-based generator's price selections. */
  budgetTier: z.enum(["budget", "standard", "premium"]).default("standard"),
});

export const updateItinerarySchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    destination: optionalText(160),
    startDate: z.union([dateOnlySchema, z.null()]).optional(),
    travelerCount: z.union([z.coerce.number().int().min(1).max(ITINERARY_MAX_TRAVELERS), z.null()]).optional(),
    status: z.enum(ITINERARY_STATUSES).optional(),
    customerId: z.union([z.string().min(1).max(64), z.null()]).optional(),
    leadId: z.union([z.string().min(1).max(64), z.null()]).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const itineraryListQuerySchema = z.object({
  status: z.enum(ITINERARY_STATUSES).optional(),
  search: optionalText(120),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(ITINERARIES_PAGE_SIZE_MAX).default(ITINERARIES_PAGE_SIZE_DEFAULT),
});

export const updateItineraryDaySchema = z
  .object({
    title: optionalText(160),
    date: z.union([dateOnlySchema, z.null()]).optional(),
    notes: optionalText(2000),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export const createItineraryItemSchema = z.object({
  itineraryDayId: z.string().trim().min(1).max(64),
  type: z.enum(ITINERARY_ITEM_TYPES).default("other"),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalText(2000),
  startTime: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().regex(TIME_HHMM, "Use HH:MM (24h) format").optional(),
  ),
  tourId: optionalText(64),
  vendorId: optionalText(64),
  costCents: z.coerce.number().int().min(0).max(100_000_000).default(0),
  priceCents: z.coerce.number().int().min(0).max(100_000_000).default(0),
});

export const updateItineraryItemSchema = z
  .object({
    type: z.enum(ITINERARY_ITEM_TYPES).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: optionalText(2000),
    startTime: z.union([z.string().regex(TIME_HHMM), z.null()]).optional(),
    tourId: z.union([z.string().min(1).max(64), z.null()]).optional(),
    vendorId: z.union([z.string().min(1).max(64), z.null()]).optional(),
    costCents: optionalInt(0, 100_000_000),
    priceCents: optionalInt(0, 100_000_000),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

/** Move an item up or down within its day's sort order — the accessible alternative to drag-and-drop (see components/itineraries). */
export const reorderItineraryItemSchema = z.object({
  direction: z.enum(["up", "down"]),
});

export const createItineraryVersionSchema = z.object({
  note: optionalText(300),
});
