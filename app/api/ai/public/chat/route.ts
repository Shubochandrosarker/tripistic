import { z } from "zod";

import { handleApiError } from "@/lib/api";
import { callerIp, consumeRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/security/rate-limit";

import { createConversation, getPublicConversation, runTurn, turnToSseStream } from "@/lib/ai/chat";
import { publicAdvisorPrompt } from "@/lib/ai/prompts";
import { readAdvisorToken, setAdvisorCookieHeader } from "@/lib/ai/public-session";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  mode: z.enum(["travel", "business"]).default("travel"),
});

/**
 * The public Travel Advisor turn endpoint.
 *
 * Unauthenticated by design, which changes what the guards have to do:
 *
 *   - **Rate limiting is IP-keyed**, because there is no workspace to bill and
 *     no account to throttle. It is the only thing standing between an open
 *     chat endpoint and someone else's model spend.
 *   - **The session comes from an httpOnly cookie, never the body.** A
 *     client-supplied conversation id would let anyone enumerate other
 *     visitors' threads.
 *   - **Retrieval is the public scope.** `scopesFor({ kind: "public" })` has no
 *     code path to a private vector, so there is nothing to leak here even if
 *     the prompt were fully compromised.
 *   - **No workspace, so no credit meter.** The IP budget is the ceiling.
 */
export async function POST(request: Request) {
  try {
    const decision = await consumeRateLimit(RATE_LIMITS.aiPublicChat, callerIp(request));
    if (!decision.allowed) {
      return Response.json(
        { error: "You have reached the limit for now. Please try again later." },
        { status: 429, headers: rateLimitHeaders(decision) },
      );
    }

    const body = chatSchema.parse(await request.json().catch(() => null));

    const existingToken = await readAdvisorToken();
    let conversation = null;
    if (existingToken) {
      // A stale or forged cookie must not be an error the visitor has to
      // understand — it silently becomes a new thread.
      conversation = await getPublicConversation(existingToken).catch(() => null);
    }
    const isNew = conversation === null;
    conversation ??= await createConversation({
      workspaceId: null,
      userId: null,
      surface: "public_advisor",
    });

    const events = runTurn({
      conversationId: conversation.id,
      surface: "public_advisor",
      task: "fast_chat",
      systemPrompt: publicAdvisorPrompt(body.mode),
      userMessage: body.message,
      workspaceId: null,
      userId: null,
      isAuthenticated: false,
      retrievalScope: { kind: "public" },
    });

    const headers = new Headers({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      ...rateLimitHeaders(decision),
    });
    if (isNew && conversation.publicToken) {
      headers.append("Set-Cookie", setAdvisorCookieHeader(conversation.publicToken));
    }

    return new Response(turnToSseStream(events), { headers });
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
