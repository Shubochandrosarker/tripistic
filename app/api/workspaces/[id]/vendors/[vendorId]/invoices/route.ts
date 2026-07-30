import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageVendors, canViewVendors } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createVendorInvoiceSchema, vendorInvoiceListQuerySchema } from "@/lib/validation";
import { createVendorInvoice, listVendorInvoices } from "@/lib/vendors/service";

type Params = { params: Promise<{ id: string; vendorId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id, vendorId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "suppliers" });
    if (!canViewVendors(membership.role)) {
      throw forbidden("You do not have permission to view vendor invoices.");
    }

    const url = new URL(request.url);
    const query = vendorInvoiceListQuerySchema.parse({
      status: url.searchParams.get("status") || undefined,
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
    });

    const { invoices, total } = await listVendorInvoices(id, vendorId, query);
    return json({ invoices, total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, vendorId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "suppliers" });
    if (!canManageVendors(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage vendor invoices.");
    }

    const body = await request.json().catch(() => null);
    const data = createVendorInvoiceSchema.parse(body);
    const invoice = await createVendorInvoice(id, vendorId, {
      ...data,
      issuedOn: new Date(`${data.issuedOn}T00:00:00.000Z`),
      dueOn: data.dueOn ? new Date(`${data.dueOn}T00:00:00.000Z`) : undefined,
    });

    await recordAuditEvent({
      action: "vendor_invoice_created",
      workspaceId: id,
      userId: user.id,
      entityType: "vendor_invoice",
      entityId: invoice.id,
      metadata: { vendorId, amountCents: invoice.amountCents },
      request,
    });

    return json({ invoice }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
