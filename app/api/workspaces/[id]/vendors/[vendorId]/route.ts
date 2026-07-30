import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageVendors, canViewVendors } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateVendorSchema } from "@/lib/validation";
import { archiveVendor, requireVendor, updateVendor } from "@/lib/vendors/service";

type Params = { params: Promise<{ id: string; vendorId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, vendorId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "suppliers" });
    if (!canViewVendors(membership.role)) {
      throw forbidden("You do not have permission to view vendors.");
    }
    const vendor = await requireVendor(id, vendorId);
    return json({ vendor });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, vendorId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "suppliers" });
    if (!canManageVendors(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage vendors.");
    }

    const body = await request.json().catch(() => null);
    const data = updateVendorSchema.parse(body);
    const vendor = await updateVendor(id, vendorId, data);

    await recordAuditEvent({
      action: "vendor_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "vendor",
      entityId: vendor.id,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({ vendor });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, vendorId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "suppliers" });
    if (!canManageVendors(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage vendors.");
    }

    const vendor = await archiveVendor(id, vendorId);

    await recordAuditEvent({
      action: "vendor_archived",
      workspaceId: id,
      userId: user.id,
      entityType: "vendor",
      entityId: vendor.id,
      metadata: { name: vendor.name },
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
