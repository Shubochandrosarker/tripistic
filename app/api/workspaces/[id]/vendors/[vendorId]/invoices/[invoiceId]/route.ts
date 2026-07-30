import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageVendors } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateVendorInvoiceSchema } from "@/lib/validation";
import { updateVendorInvoice } from "@/lib/vendors/service";

type Params = { params: Promise<{ id: string; vendorId: string; invoiceId: string }> };

/** Marks an invoice paid/cancelled, or edits its due date/notes. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, invoiceId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "suppliers" });
    if (!canManageVendors(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage vendor invoices.");
    }

    const body = await request.json().catch(() => null);
    const data = updateVendorInvoiceSchema.parse(body);
    const invoice = await updateVendorInvoice(id, invoiceId, {
      ...data,
      dueOn: data.dueOn === null ? null : data.dueOn ? new Date(`${data.dueOn}T00:00:00.000Z`) : undefined,
    });

    await recordAuditEvent({
      action: "vendor_invoice_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "vendor_invoice",
      entityId: invoice.id,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({ invoice });
  } catch (error) {
    return handleApiError(error);
  }
}
