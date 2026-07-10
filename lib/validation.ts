import { z } from "zod";
import { BUSINESS_TYPES, SETTING_KEYS, WORKSPACE_ROLES } from "@/lib/constants";

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

/** Manual audit events accepted over the API (system events use the helper directly). */
export const manualAuditEventSchema = z.object({
  workspaceId: z.string().min(1),
  action: z.enum(["admin_action", "settings_updated", "billing_updated"]),
  entityType: z.string().trim().max(64).optional(),
  entityId: z.string().trim().max(64).optional(),
  metadata: z.record(z.union([z.string().max(500), z.number(), z.boolean()])).optional(),
});
