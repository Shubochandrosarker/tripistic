import { z } from "zod";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const uploadIntentSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  byteSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
  altText: z.string().trim().min(3).max(240),
});

export const completeUploadSchema = z.object({
  width: z.number().int().positive().max(12000).optional(),
  height: z.number().int().positive().max(12000).optional(),
  focalX: z.number().min(0).max(1).default(0.5),
  focalY: z.number().min(0).max(1).default(0.5),
});

export type UploadIntentInput = z.infer<typeof uploadIntentSchema>;
