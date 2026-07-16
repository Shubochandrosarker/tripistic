import type { z } from "zod";
import type { vehicleListQuerySchema } from "@/lib/validation";

export type VehicleListQuery = z.infer<typeof vehicleListQuerySchema>;
