import { handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { listTemplatesForWorkspace } from "@/lib/sites/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string }> };

/** Website templates, ordered so ones suited to this business type lead. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    return json({ templates: await listTemplatesForWorkspace(id) });
  } catch (error) {
    return handleApiError(error);
  }
}
