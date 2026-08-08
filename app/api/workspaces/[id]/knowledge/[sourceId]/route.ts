import { forbidden, handleApiError, json } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { deleteSource } from "@/lib/ai/rag/indexer";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; sourceId: string }> };

/**
 * Removes a knowledge source and every vector it produced.
 *
 * Scoped by workspace inside `deleteSource`, so a sourceId belonging to
 * another tenant deletes nothing rather than deleting theirs.
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, sourceId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, {
      feature: "ai_private_knowledge",
    });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage the knowledge base.");
    }

    const result = await deleteSource({ sourceId, workspaceId: id });

    await recordAuditEvent({
      action: "knowledge_source_deleted",
      workspaceId: id,
      userId: user.id,
      entityType: "knowledge_source",
      entityId: sourceId,
      metadata: { deletedVectors: result.deletedVectors },
      request,
    });

    return json({ deletedVectors: result.deletedVectors });
  } catch (error) {
    return handleApiError(error);
  }
}
