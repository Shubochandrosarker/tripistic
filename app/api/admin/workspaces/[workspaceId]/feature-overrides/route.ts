import { z } from "zod";

import { badRequest, handleApiError, json, notFound } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { requirePlatformAdminApi } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { isGrantableOverrideKey } from "@/lib/plans/catalog";

type Params = { params: Promise<{ workspaceId: string }> };

const MAX_DAYS = 180;

const grantSchema = z.object({
  featureKey: z.string().trim().min(1).max(64),
  enabled: z.boolean().default(true),
  /**
   * Bounded, and required for a grant.
   *
   * "Temporary access" with no end date is a permanent entitlement nobody
   * wrote down, and six months is already long enough that the person who
   * granted it will have forgotten. A genuinely permanent change belongs on
   * the plan, not in an override.
   */
  expiresInDays: z.number().int().min(1).max(MAX_DAYS),
  reason: z.string().trim().min(4).max(500),
});

const revokeSchema = z.object({
  featureKey: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(4).max(500),
});

/** Current overrides for one workspace, expired ones included and labelled. */
export async function GET(_request: Request, { params }: Params) {
  try {
    await requirePlatformAdminApi();
    const { workspaceId } = await params;

    const overrides = await prisma.featureFlag.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      include: { grantedBy: { select: { name: true, email: true } } },
    });

    return json({
      overrides: overrides.map((override) => ({
        id: override.id,
        featureKey: override.featureKey,
        enabled: override.enabled,
        expiresAt: override.expiresAt,
        expired: override.expiresAt !== null && override.expiresAt.getTime() <= Date.now(),
        reason: override.reason,
        grantedBy: override.grantedBy?.name ?? override.grantedBy?.email ?? null,
        updatedAt: override.updatedAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Grants (or denies) a feature for one workspace, for a bounded period.
 *
 * Replaces any existing override for the same key rather than stacking. Two
 * live rows for one feature would make the answer depend on `updatedAt`
 * ordering, which is exactly the kind of resolution nobody can reason about
 * during an incident.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const admin = await requirePlatformAdminApi();
    const { workspaceId } = await params;
    const data = grantSchema.parse(await request.json().catch(() => null));

    if (!isGrantableOverrideKey(data.featureKey)) {
      // An unknown key would create a row nothing ever reads — an override that
      // looks granted in the admin UI and changes nothing for the customer.
      throw badRequest(`Unknown feature key: ${data.featureKey}`);
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!workspace) throw notFound("Workspace not found.");

    const expiresAt = new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000);

    const override = await prisma.$transaction(async (tx) => {
      await tx.featureFlag.deleteMany({ where: { workspaceId, featureKey: data.featureKey } });
      return tx.featureFlag.create({
        data: {
          workspaceId,
          featureKey: data.featureKey,
          enabled: data.enabled,
          expiresAt,
          reason: data.reason,
          grantedById: admin.id,
        },
      });
    });

    await recordAuditEvent({
      action: "admin_feature_override_granted",
      workspaceId,
      userId: admin.id,
      entityType: "feature_flag",
      entityId: override.id,
      metadata: {
        featureKey: data.featureKey,
        enabled: data.enabled,
        expiresAt: expiresAt.toISOString(),
        reason: data.reason,
      },
      request,
    });

    return json({ override }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Removes an override immediately, returning the workspace to its plan. */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const admin = await requirePlatformAdminApi();
    const { workspaceId } = await params;
    const data = revokeSchema.parse(await request.json().catch(() => null));

    const removed = await prisma.featureFlag.deleteMany({
      where: { workspaceId, featureKey: data.featureKey },
    });
    if (removed.count === 0) throw notFound("No override for that feature.");

    await recordAuditEvent({
      action: "admin_feature_override_revoked",
      workspaceId,
      userId: admin.id,
      entityType: "feature_flag",
      entityId: `${workspaceId}:${data.featureKey}`,
      metadata: { featureKey: data.featureKey, reason: data.reason },
      request,
    });

    return json({ revoked: removed.count });
  } catch (error) {
    return handleApiError(error);
  }
}
