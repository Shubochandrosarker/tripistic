import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageWaiverTemplate } from "@/lib/auth/permissions";
import { publishWaiverVersionSchema } from "@/lib/validation";
import { listWaiverVersions, publishWaiverVersion } from "@/lib/waivers/service";

type Params = { params: Promise<{ id: string }> };

/** Current version + full version history — an editing surface, not a general read, so gated the same as PUT. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "digital_waivers" });
    if (!canManageWaiverTemplate(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage the waiver.");
    }

    const versions = await listWaiverVersions(id);
    return json({
      currentVersion: versions[0] ?? null,
      versions: versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        title: v.title,
        createdAt: v.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Publishes a new immutable version — never mutates a prior one. */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "digital_waivers" });
    if (!canManageWaiverTemplate(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage the waiver.");
    }

    const body = await request.json().catch(() => null);
    const data = publishWaiverVersionSchema.parse(body);

    const version = await publishWaiverVersion({
      workspaceId: id,
      title: data.title,
      bodyText: data.bodyText,
      createdById: user.id,
    });

    return json({ version }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
