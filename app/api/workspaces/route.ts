import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { generateWorkspaceSlug, getMemberships } from "@/lib/tenancy/workspace";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createWorkspaceSchema } from "@/lib/validation";
import { ACTIVE_WORKSPACE_COOKIE, DEFAULT_PLAN_SLUG, TRIAL_DAYS } from "@/lib/constants";

/** Workspaces the caller belongs to. */
export async function GET() {
  try {
    const user = await requireUserApi();
    const memberships = await getMemberships(user.id);
    return json({
      workspaces: memberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        businessType: membership.workspace.businessType,
        timezone: membership.workspace.timezone,
        currency: membership.workspace.currency,
        country: membership.workspace.country,
        status: membership.workspace.status,
        role: membership.role,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Create a workspace: owner membership + trial subscription on the default plan. */
export async function POST(request: Request) {
  try {
    const user = await requireUserApi();
    const body = await request.json().catch(() => null);
    const data = createWorkspaceSchema.parse(body);

    const slug = await generateWorkspaceSlug(data.name);
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    // Default plan is optional at this stage — the app must boot before seeding.
    const defaultPlan = await prisma.plan.findUnique({
      where: { slug: DEFAULT_PLAN_SLUG },
    });

    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: data.name,
          slug,
          businessType: data.businessType,
          timezone: data.timezone,
          currency: data.currency,
          country: data.country ?? null,
          ownerId: user.id,
          trialEndsAt: defaultPlan ? trialEndsAt : null,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: created.id,
          userId: user.id,
          role: "workspace_owner",
        },
      });

      if (defaultPlan) {
        await tx.subscription.create({
          data: {
            workspaceId: created.id,
            planId: defaultPlan.id,
            status: "trialing",
            trialEndsAt,
            currentPeriodStart: new Date(),
            currentPeriodEnd: trialEndsAt,
          },
        });
      }

      return created;
    });

    await recordAuditEvent({
      action: "workspace_created",
      workspaceId: workspace.id,
      userId: user.id,
      entityType: "workspace",
      entityId: workspace.id,
      metadata: { name: workspace.name, businessType: workspace.businessType },
      request,
    });

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return json(
      {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
        },
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
