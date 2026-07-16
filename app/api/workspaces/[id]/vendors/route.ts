import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageVendors, canViewVendors } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { vendorListQuerySchema, vendorSchema } from "@/lib/validation";
import { createVendor, listVendors } from "@/lib/vendors/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewVendors(membership.role)) {
      throw forbidden("You do not have permission to view vendors.");
    }

    const url = new URL(request.url);
    const query = vendorListQuerySchema.parse({
      kind: url.searchParams.get("kind") || undefined,
      isActive: url.searchParams.get("isActive") || undefined,
      search: url.searchParams.get("search") || undefined,
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
    });

    const { vendors, total } = await listVendors(id, query);
    return json({ vendors, total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageVendors(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage vendors.");
    }

    const body = await request.json().catch(() => null);
    const data = vendorSchema.parse(body);
    const vendor = await createVendor(id, data);

    await recordAuditEvent({
      action: "vendor_created",
      workspaceId: id,
      userId: user.id,
      entityType: "vendor",
      entityId: vendor.id,
      metadata: { name: vendor.name, kind: vendor.kind },
      request,
    });

    return json({ vendor }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
