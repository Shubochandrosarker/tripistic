import { z } from "zod";
import {
  BUSINESS_TYPES,
  SETTING_KEYS,
  SLOT_GENERATION_DEFAULT_DAYS,
  SLOT_GENERATION_MAX_DAYS,
  TOUR_KINDS,
  TOUR_STATUSES,
  TOUR_VISIBILITIES,
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

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Workspace name is too short").max(80),
  businessType: z.enum(BUSINESS_TYPES),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  currency: z.string().trim().toUpperCase().length(3, "Use a 3-letter currency code").default("USD"),
  country: countrySchema,
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    businessType: z.enum(BUSINESS_TYPES).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
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
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const dateOnlySchema = z
  .string()
  .regex(DATE_ONLY, "Use YYYY-MM-DD format")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid date");

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
});

export const updateAvailabilitySchema = z
  .object({
    capacity: optionalInt(1, 1000),
    priceOverride: z.union([z.coerce.number().int().min(0).max(100_000_000), z.null()]).optional(),
    notes: optionalText(500),
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

/** Manual audit events accepted over the API (system events use the helper directly). */
export const manualAuditEventSchema = z.object({
  workspaceId: z.string().min(1),
  action: z.enum(["admin_action", "settings_updated", "billing_updated"]),
  entityType: z.string().trim().max(64).optional(),
  entityId: z.string().trim().max(64).optional(),
  metadata: z.record(z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
});
