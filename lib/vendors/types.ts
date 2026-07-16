import type { z } from "zod";
import type { vendorInvoiceListQuerySchema, vendorListQuerySchema } from "@/lib/validation";

export type VendorListQuery = z.infer<typeof vendorListQuerySchema>;
export type VendorInvoiceListQuery = z.infer<typeof vendorInvoiceListQuerySchema>;
