import { z } from "zod";

import { handleApiError } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { consumeRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/security/rate-limit";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

import {
  assertConversationOwner,
  createConversation,
  getWorkspaceConversation,
  runTurn,
  turnToSseStream,
} from "@/lib/ai/chat";
import { workspaceCopilotPrompt } from "@/lib/ai/prompts";
import { hasFeature } from "@/lib/plans/entitlements";

type Params = { params: Promise<{ id: string }> };

const chatSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  /** Omit to start a new thread. */
  conversationId: z.string().trim().min(1).max(64).optional(),
  /** Dashboard route the user is on, so "this tour" resolves. */
  route: z.string().trim().max(200).optional(),
  focus: z
    .object({
      kind: z.enum(["tour", "site", "booking", "customer"]),
      id: z.string().trim().min(1).max(64),
      label: z.string().trim().max(160).optional(),
    })
    .optional(),
});

/**
 * The workspace Copilot turn endpoint.
 *
 * Streams `text/event-stream`. The order of the guards below is the security
 * story and is worth stating: session, then membership, then entitlement, then
 * rate limit, then conversation ownership — every one server-side, none of them
 * inferable from the request body. The `workspaceId` used for retrieval and for
 * every tool call is the one resolved from membership, never the one the client
 * sent, which is what makes a prompt-injected tool call unable to cross a
 * tenant boundary.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "ai_copilot" });

    // Keyed on the workspace, not the caller: what is being protected is spend,
    // and spend is attributable to the workspace whichever member incurs it.
    const decision = await consumeRateLimit(RATE_LIMITS.aiWorkspaceChat, id);
    if (!decision.allowed) {
      return Response.json(
        { error: "Too many AI requests. Try again shortly." },
        { status: 429, headers: rateLimitHeaders(decision) },
      );
    }

    const body = chatSchema.parse(await request.json().catch(() => null));

    const conversation = body.conversationId
      ? await getWorkspaceConversation(id, body.conversationId)
      : await createConversation({
          workspaceId: id,
          userId: user.id,
          surface: "workspace_copilot",
        });
    assertConversationOwner(conversation, user.id);

    const workspace = membership.workspace;
    // Private knowledge is a paid capability. Without it the copilot still
    // answers from tools and Tripistic's own documentation — it simply cannot
    // read the workspace's uploaded corpus, which is the thing being sold.
    const canUsePrivateKnowledge = await hasFeature(id, "ai_private_knowledge");

    const events = runTurn({
      conversationId: conversation.id,
      surface: "workspace_copilot",
      task: "rag_answer",
      systemPrompt: workspaceCopilotPrompt({
        workspaceName: workspace.name,
        businessType: workspace.businessType,
        currency: workspace.currency,
        timezone: workspace.timezone,
        route: body.route,
        focus: body.focus,
      }),
      userMessage: body.message,
      workspaceId: id,
      userId: user.id,
      isAuthenticated: true,
      retrievalScope: canUsePrivateKnowledge
        ? { kind: "workspace", workspaceId: id }
        : undefined,
    });

    return new Response(turnToSseStream(events), {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        // Nginx and several CDNs buffer proxied responses by default, which
        // turns a stream into one delivery at the end. This is the documented
        // opt-out and costs nothing where it is not understood.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Recent threads for the signed-in member. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    await requireWorkspaceAccess(user.id, id, { feature: "ai_copilot" });

    const { listWorkspaceConversations } = await import("@/lib/ai/chat");
    const { usageSnapshot } = await import("@/lib/ai/usage");
    const [conversations, usage] = await Promise.all([
      listWorkspaceConversations(id, user.id),
      usageSnapshot(id),
    ]);

    return Response.json(
      { conversations, usage: { used: usage.used, limit: usage.limit, warning: usage.warning } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
