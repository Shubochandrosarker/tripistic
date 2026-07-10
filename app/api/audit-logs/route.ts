import { prisma } from "@/lib/db";
import { badRequest, forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canViewAuditLogs } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { manualAuditEventSchema } from "@/lib/validation";

/** Workspace-scoped audit log (owner/admin only). ?workspaceId= is required. */
export async function GET(request: Request) {
  try {
    const user = await requireUserApi();
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) throw badRequest("workspaceId is required");

    const limitParam = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

    const membership = await requireWorkspaceAccess(user.id, workspaceId);
    if (!canViewAuditLogs(membership.role)) {
      throw forbidden("Only workspace owners and admins can view audit logs.");
    }

    const logs = await prisma.auditLog.findMany({
      where: { workspaceId },
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true, name: true } } },
    });

    return json({
      auditLogs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadata,
        actor: log.user ? { name: log.user.name, email: log.user.email } : null,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Record a manual audit event (allow-listed actions; owner/admin only). */
export async function POST(request: Request) {
  try {
    const user = await requireUserApi();
    const body = await request.json().catch(() => null);
    const data = manualAuditEventSchema.parse(body);

    const membership = await requireWorkspaceAccess(user.id, data.workspaceId);
    if (!canViewAuditLogs(membership.role)) {
      throw forbidden("Only workspace owners and admins can record audit events.");
    }

    await recordAuditEvent({
      action: data.action,
      workspaceId: data.workspaceId,
      userId: user.id,
      entityType: data.entityType,
      entityId: data.entityId,
      metadata: { ...(data.metadata ?? {}), source: "api" },
      request,
    });

    return json({ ok: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
