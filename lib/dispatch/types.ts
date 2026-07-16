import type { z } from "zod";
import type { incidentListQuerySchema } from "@/lib/validation";

export type IncidentListQuery = z.infer<typeof incidentListQuerySchema>;
