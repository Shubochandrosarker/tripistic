import type { z } from "zod";
import type {
  companyListQuerySchema,
  crmTaskListQuerySchema,
  leadListQuerySchema,
} from "@/lib/validation";

export type CompanyListQuery = z.infer<typeof companyListQuerySchema>;
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export type CrmTaskListQuery = z.infer<typeof crmTaskListQuerySchema>;
