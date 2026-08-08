import { z } from "zod";

import { forbidden, handleApiError, json, noStoreJson } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { indexSource } from "@/lib/ai/rag/indexer";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { ApiError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const createSourceSchema = z.object({
  title: z.string().trim().min(2).max(200),
  sourceType: z.enum(["operator_faq", "policy", "meeting_instructions", "company_profile", "note"]),
  body: z.string().trim().min(20).max(200_000),
  language: z.string().trim().min(2).max(8).default("en"),
});

/** This workspace's private knowledge sources and their index state. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    await requireWorkspaceAccess(user.id, id, { feature: "ai_private_knowledge" });

    const sources = await prisma.knowledgeSource.findMany({
      where: { workspaceId: id, scope: "private" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        sourceType: true,
        status: true,
        language: true,
        version: true,
        indexedAt: true,
        updatedAt: true,
      },
    });
    return noStoreJson({ sources });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Adds or replaces a private knowledge source and indexes it.
 *
 * Rate limited per workspace, not per IP. Indexing costs an embedding call per
 * chunk, so the resource being protected is spend rather than an authentication
 * surface — and spend is attributable to the workspace, whichever member or
 * office IP happens to submit it.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, {
      feature: "ai_private_knowledge",
    });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage the knowledge base.");
    }

    const decision = await consumeRateLimit(RATE_LIMITS.knowledgeUpload, id);
    if (!decision.allowed) {
      throw new ApiError(429, "Too many knowledge updates. Try again shortly.");
    }

    const data = createSourceSchema.parse(await request.json().catch(() => null));
    const result = await indexSource({
      scope: "private",
      workspaceId: id,
      sourceType: data.sourceType,
      // Derived server-side. A client-supplied source id would let one
      // workspace's submission collide with the composite unique key of
      // another scope's row.
      sourceId: `${id}:${data.sourceType}:${data.title.toLowerCase().slice(0, 80)}`,
      title: data.title,
      body: data.body,
      language: data.language,
    });

    await recordAuditEvent({
      action: "knowledge_source_indexed",
      workspaceId: id,
      userId: user.id,
      entityType: "knowledge_source",
      entityId: result.sourceId,
      metadata: { chunks: result.chunks, skipped: result.skipped },
      request,
    });

    return json({ result }, result.skipped ? 200 : 201);
  } catch (error) {
    return handleApiError(error);
  }
}
