import { z } from "zod";

import { ApiError, forbidden } from "@/lib/api";
import { canManageBookings, canManageTours, canManageWorkspace } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { hasFeature } from "@/lib/plans/entitlements";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

import { retrieve } from "@/lib/ai/rag/retrieve";

/**
 * The permission-aware tool layer.
 *
 * The design rule, and the reason this file is structured the way it is: **a
 * tool call is an ordinary authenticated request that happens to have been
 * proposed by a model.** It gets the same tenancy guard, the same role check
 * and the same entitlement check as a request from a browser, and it gets them
 * from the same functions — `requireWorkspaceAccess`, the `canManage*`
 * predicates, `hasFeature`. Nothing here consults the conversation to decide
 * what is allowed, which is exactly why a successful prompt injection still
 * cannot make a tool do something the user could not do themselves.
 *
 * Three consequences worth naming:
 *
 *   - **No tool takes a `workspaceId` argument.** It comes from the verified
 *     session context, so a model cannot be talked into changing it. This is
 *     the tool-layer form of the rule the whole V3 brief repeats.
 *   - **No tool executes free-form queries.** Every one is a fixed Prisma call
 *     with validated arguments. An LLM that can compose a query is an LLM that
 *     can compose `WHERE 1=1`.
 *   - **Writes produce drafts and require confirmation.** The model proposes;
 *     a person accepts. `RiskLevel` is what the API layer reads to decide
 *     whether to execute or return a proposal.
 */

export type RiskLevel = "auto" | "confirm" | "strong_confirm";

export type ToolContext = {
  userId: string;
  /** Verified server-side. Never taken from a model argument. */
  workspaceId: string | null;
  /** Anonymous public-advisor callers have neither. */
  isAuthenticated: boolean;
  requestId?: string;
};

export type ToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  input: TInput;
  risk: RiskLevel;
  /** Whether an unauthenticated public caller may use it. */
  publicSafe: boolean;
  run: (args: z.infer<TInput>, context: ToolContext) => Promise<unknown>;
};

/**
 * Resolves and checks the caller's workspace membership.
 *
 * Every workspace tool starts here, so the tenancy check cannot be forgotten
 * by a tool author: there is no other way to obtain the workspace id a query
 * needs.
 */
async function requireWorkspace(context: ToolContext) {
  if (!context.isAuthenticated || !context.workspaceId) {
    throw forbidden("This action requires you to be signed in to a workspace.");
  }
  const membership = await requireWorkspaceAccess(context.userId, context.workspaceId);
  return { workspaceId: context.workspaceId, role: membership.role };
}

function tool<TInput extends z.ZodTypeAny>(definition: ToolDefinition<TInput>): ToolDefinition {
  return definition as unknown as ToolDefinition;
}

/* ------------------------------------------------------------------------ */
/* Read tools                                                                */
/* ------------------------------------------------------------------------ */

const searchTours = tool({
  name: "searchTours",
  description: "Search this workspace's tours by title or location.",
  input: z.object({
    query: z.string().trim().max(120).optional(),
    status: z.enum(["draft", "active", "archived"]).optional(),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  risk: "auto",
  publicSafe: false,
  async run(args, context) {
    const { workspaceId } = await requireWorkspace(context);
    return prisma.tour.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(args.status ? { status: args.status } : {}),
        ...(args.query
          ? {
              OR: [
                { title: { contains: args.query, mode: "insensitive" as const } },
                { location: { contains: args.query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      take: args.limit,
      orderBy: { updatedAt: "desc" },
      // An explicit select, not the whole row. A tool result becomes prompt
      // text and then, often, a logged transcript; sending fields nobody needs
      // is how internal columns end up in a model provider's logs.
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        basePrice: true,
        currency: true,
        durationMinutes: true,
        capacity: true,
        location: true,
      },
    });
  },
});

const getBookings = tool({
  name: "getBookings",
  description: "Bookings for this workspace in a date range, with guest counts and status.",
  input: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    status: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  risk: "auto",
  publicSafe: false,
  async run(args, context) {
    const { workspaceId, role } = await requireWorkspace(context);
    if (!canManageBookings(role)) {
      throw forbidden("Your role does not include booking access.");
    }
    const bookings = await prisma.booking.findMany({
      where: {
        workspaceId,
        ...(args.status ? { status: args.status } : {}),
        ...(args.from || args.to
          ? {
              availability: {
                startsAt: {
                  ...(args.from ? { gte: new Date(args.from) } : {}),
                  ...(args.to ? { lte: new Date(args.to) } : {}),
                },
              },
            }
          : {}),
      },
      take: args.limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reference: true,
        status: true,
        totalAmount: true,
        currency: true,
        participantCount: true,
        availability: { select: { startsAt: true, tour: { select: { title: true } } } },
      },
    });

    /**
     * Guest names, emails and phone numbers are deliberately absent.
     *
     * Answering "how many bookings tomorrow" does not need them, and anything
     * a tool returns is sent to a model provider. PII goes to a provider only
     * when a specific task genuinely requires it — and no task here does.
     */
    return bookings;
  },
});

const getAvailability = tool({
  name: "getAvailability",
  description: "Upcoming departures and remaining capacity for a tour.",
  input: z.object({
    tourId: z.string().trim().min(1).max(64),
    limit: z.number().int().min(1).max(30).default(10),
  }),
  risk: "auto",
  publicSafe: false,
  async run(args, context) {
    const { workspaceId } = await requireWorkspace(context);
    // Scoped by workspace as well as tour: a tourId from another tenant
    // resolves to nothing rather than to their departures.
    return prisma.availability.findMany({
      where: { workspaceId, tourId: args.tourId, startsAt: { gte: new Date() } },
      take: args.limit,
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        bookedCount: true,
        status: true,
      },
    });
  },
});

const getWorkspaceProfile = tool({
  name: "getWorkspaceProfile",
  description: "This workspace's business profile: name, currency, timezone, country.",
  input: z.object({}),
  risk: "auto",
  publicSafe: false,
  async run(_args, context) {
    const { workspaceId } = await requireWorkspace(context);
    return prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        slug: true,
        businessType: true,
        currency: true,
        timezone: true,
        country: true,
      },
    });
  },
});

const getSubscriptionAndUsage = tool({
  name: "getSubscriptionAndUsage",
  description: "The workspace's current plan and this month's AI usage.",
  input: z.object({}),
  risk: "auto",
  publicSafe: false,
  async run(_args, context) {
    const { workspaceId, role } = await requireWorkspace(context);
    if (!canManageWorkspace(role)) {
      throw forbidden("Only owners and admins can see billing information.");
    }
    const { usageSnapshot } = await import("@/lib/ai/usage");
    const [subscription, usage] = await Promise.all([
      prisma.subscription.findFirst({
        where: { workspaceId, status: { in: ["trialing", "active", "past_due"] } },
        select: {
          status: true,
          currentPeriodEnd: true,
          plan: { select: { name: true, slug: true } },
        },
      }),
      usageSnapshot(workspaceId),
    ]);
    return { subscription, usage: { used: usage.used, limit: usage.limit } };
  },
});

const getDomains = tool({
  name: "getDomains",
  description: "Custom domains for this workspace and their DNS/TLS status.",
  input: z.object({}),
  risk: "auto",
  publicSafe: false,
  async run(_args, context) {
    const { workspaceId, role } = await requireWorkspace(context);
    if (!canManageWorkspace(role)) throw forbidden("Only owners and admins can see domains.");
    return prisma.customDomain.findMany({
      where: { workspaceId },
      select: {
        id: true,
        hostname: true,
        status: true,
        expectedCname: true,
        lastCheckedAt: true,
        lastCheckMessage: true,
      },
    });
  },
});

const searchKnowledge = tool({
  name: "searchKnowledge",
  description: "Search Tripistic documentation and this workspace's own knowledge base.",
  input: z.object({
    query: z.string().trim().min(2).max(400),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  risk: "auto",
  // Safe for the public advisor, which resolves to the public+global scope and
  // therefore has no code path to any workspace's private corpus.
  publicSafe: true,
  async run(args, context) {
    const scope =
      context.isAuthenticated && context.workspaceId
        ? ({ kind: "workspace", workspaceId: context.workspaceId } as const)
        : ({ kind: "public" } as const);

    if (scope.kind === "workspace") await requireWorkspace(context);

    const result = await retrieve({ query: args.query, scope, topK: args.limit });
    return result.chunks.map((chunk) => ({
      title: chunk.title,
      text: chunk.text,
      sourceType: chunk.sourceType,
      updatedAt: chunk.updatedAt,
    }));
  },
});

const searchPublicTours = tool({
  name: "searchPublicTours",
  description: "Search publicly listed Tripistic tours by destination or keyword.",
  input: z.object({
    query: z.string().trim().min(2).max(120),
    limit: z.number().int().min(1).max(12).default(6),
  }),
  risk: "auto",
  publicSafe: true,
  async run(args) {
    // Only tours their operator chose to publish, in workspaces that are live.
    // No workspace scope, because there is no caller workspace — this is the
    // public marketplace view, and it is the same data any visitor can browse.
    return prisma.tour.findMany({
      where: {
        status: "active",
        visibility: "public",
        deletedAt: null,
        workspace: { status: "active", deletedAt: null },
        OR: [
          { title: { contains: args.query, mode: "insensitive" } },
          { location: { contains: args.query, mode: "insensitive" } },
        ],
      },
      take: args.limit,
      select: {
        title: true,
        slug: true,
        location: true,
        durationMinutes: true,
        basePrice: true,
        currency: true,
        workspace: { select: { name: true, slug: true } },
      },
    });
  },
});

/* ------------------------------------------------------------------------ */
/* Draft-producing tools                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Write tools return a *proposal*, never a mutation.
 *
 * The model produces a validated draft object; the API layer shows it to the
 * user; the user's acceptance calls the ordinary route that already exists for
 * that resource, with its own guard and its own audit entry. So there is no
 * second write path with weaker checks, which is the failure mode a tool layer
 * usually introduces.
 */
const proposeTourCopy = tool({
  name: "proposeTourCopy",
  description:
    "Draft an improved title, summary and description for a tour. Returns a proposal for the user to accept.",
  input: z.object({
    tourId: z.string().trim().min(1).max(64),
    tone: z.enum(["warm", "premium", "adventurous", "plain"]).default("warm"),
  }),
  risk: "confirm",
  publicSafe: false,
  async run(args, context) {
    const { workspaceId, role } = await requireWorkspace(context);
    if (!canManageTours(role)) throw forbidden("Your role does not include editing tours.");

    const tour = await prisma.tour.findFirst({
      where: { id: args.tourId, workspaceId, deletedAt: null },
      select: { id: true, title: true, description: true, location: true },
    });
    if (!tour) throw new ApiError(404, "Tour not found.");

    // The proposal is assembled by the caller's model turn; this tool supplies
    // the grounded inputs and the shape the proposal must take.
    return {
      proposal: {
        kind: "tour_copy" as const,
        tourId: tour.id,
        tone: args.tone,
        current: { title: tour.title, description: tour.description },
      },
      requiresConfirmation: true,
      applyVia: `PATCH /api/workspaces/${workspaceId}/tours/${tour.id}`,
    };
  },
});

const proposeSitePageDraft = tool({
  name: "proposeSitePageDraft",
  description:
    "Draft website page sections for the Site Builder. Returns a proposal; publishing always stays manual.",
  input: z.object({
    siteId: z.string().trim().min(1).max(64),
    pageId: z.string().trim().min(1).max(64),
    goal: z.string().trim().min(3).max(300),
  }),
  risk: "confirm",
  publicSafe: false,
  async run(args, context) {
    const { workspaceId, role } = await requireWorkspace(context);
    if (!canManageWorkspace(role)) throw forbidden("Only owners and admins can edit the website.");
    if (!(await hasFeature(workspaceId, "storefront_builder"))) {
      throw new ApiError(402, "The Site Builder is not included in your current plan.");
    }

    const page = await prisma.sitePage.findFirst({
      where: { id: args.pageId, siteId: args.siteId, workspaceId },
      select: { id: true, path: true, title: true, content: true },
    });
    if (!page) throw new ApiError(404, "Page not found.");

    return {
      proposal: { kind: "site_page" as const, pageId: page.id, goal: args.goal, current: page.content },
      requiresConfirmation: true,
      // Publishing is STRONG_CONFIRM and has no tool at all — see below.
      applyVia: `PATCH /api/workspaces/${workspaceId}/sites/${args.siteId}/pages/${page.id}`,
    };
  },
});

/* ------------------------------------------------------------------------ */
/* Registry                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * The complete tool set.
 *
 * Deliberately absent: anything that publishes a site, cancels a booking,
 * issues a refund, changes a subscription or removes a domain. Those are the
 * STRONG_CONFIRM class in the brief, and the safest implementation of "the LLM
 * cannot bypass confirmation" is that no tool exists for them — a person
 * performs them in the dashboard. Adding one later would need a human-in-the-
 * loop step that this registry cannot express, and that gap is intentional.
 */
export const AI_TOOLS: ToolDefinition[] = [
  searchTours,
  getBookings,
  getAvailability,
  getWorkspaceProfile,
  getSubscriptionAndUsage,
  getDomains,
  searchKnowledge,
  searchPublicTours,
  proposeTourCopy,
  proposeSitePageDraft,
];

export function findTool(name: string): ToolDefinition | undefined {
  return AI_TOOLS.find((item) => item.name === name);
}

/** Tools offered on a surface. Public surfaces get the public-safe subset. */
export function toolsForSurface(isAuthenticated: boolean): ToolDefinition[] {
  return isAuthenticated ? AI_TOOLS : AI_TOOLS.filter((item) => item.publicSafe);
}

export type ToolInvocationResult =
  | { ok: true; name: string; risk: RiskLevel; result: unknown }
  | { ok: false; name: string; error: string; status: number };

/**
 * Executes a tool call proposed by a model.
 *
 * Argument validation happens here, before the tool body, so a malformed or
 * hallucinated argument produces a typed error the model can recover from
 * rather than a Prisma exception. Errors are returned rather than thrown so
 * one failed tool call does not abort the whole turn — the model is told what
 * went wrong and can try something else, which is the behaviour a user
 * experiences as the assistant working.
 */
export async function invokeTool(
  name: string,
  rawArgs: unknown,
  context: ToolContext,
): Promise<ToolInvocationResult> {
  const definition = findTool(name);
  if (!definition) {
    return { ok: false, name, error: `Unknown tool: ${name}`, status: 400 };
  }
  if (!definition.publicSafe && !context.isAuthenticated) {
    return { ok: false, name, error: "This tool requires an authenticated session.", status: 403 };
  }

  const parsed = definition.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      name,
      error: `Invalid arguments: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      status: 400,
    };
  }

  try {
    const result = await definition.run(parsed.data, context);
    if (definition.risk !== "auto") {
      // Every proposal is logged, so "what did the assistant offer to change"
      // is answerable after the fact even if the user never accepted it.
      logger.info("ai.tool_proposal", {
        tool: name,
        workspaceId: context.workspaceId ?? undefined,
        userId: context.userId,
        risk: definition.risk,
      });
    }
    return { ok: true, name, risk: definition.risk, result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, name, error: error.message, status: error.status };
    }
    logger.error("ai.tool_failed", { tool: name, workspaceId: context.workspaceId ?? undefined }, error);
    return { ok: false, name, error: "The tool could not complete.", status: 500 };
  }
}

/**
 * Descriptors for a provider's function-calling payload.
 *
 * The parameter shape is described in prose rather than converted to JSON
 * Schema. Zod 3 has no first-party converter, and hand-rolling one that
 * silently disagrees with the schema it claims to describe is worse than not
 * having one: the model would be told a field is optional that validation then
 * rejects. `invokeTool` re-validates every call against the real schema
 * regardless, so an inaccurate descriptor can only cost a retry, never
 * correctness.
 */
export function toolDescriptors(tools: ToolDefinition[]) {
  return tools.map((item) => ({
    name: item.name,
    description: item.description,
    risk: item.risk,
    parameterKeys:
      item.input instanceof z.ZodObject ? Object.keys(item.input.shape as object) : [],
  }));
}
