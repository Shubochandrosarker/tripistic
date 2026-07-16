import type { z } from "zod";
import type { itineraryListQuerySchema } from "@/lib/validation";

export type ItineraryListQuery = z.infer<typeof itineraryListQuerySchema>;
