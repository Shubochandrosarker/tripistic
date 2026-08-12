import { handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

import { getPublicConversation } from "@/lib/ai/chat";
import { clearAdvisorCookieHeader, readAdvisorToken } from "@/lib/ai/public-session";

/**
 * Adopts an anonymous advisor thread into the account that just registered.
 *
 * Called after sign-up, so the itinerary someone spent ten minutes building
 * does not vanish the moment they create an account — which is the single
 * biggest reason a visitor abandons at that step.
 *
 * The claim is one-way and idempotent. Adoption sets `userId` and clears
 * `publicToken`, so the cookie that authorised it stops working immediately;
 * a replayed request finds nothing and returns the same answer. The thread
 * stays workspace-less: it was a public conversation and its retrieval scope
 * was public, so promoting it into a tenant's history would file public-scoped
 * answers under a workspace that never asked them.
 */
export async function POST() {
  try {
    const user = await requireUserApi();
    const token = await readAdvisorToken();
    if (!token) return json({ adopted: false });

    const conversation = await getPublicConversation(token).catch(() => null);
    if (!conversation) {
      return new Response(JSON.stringify({ adopted: false }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": clearAdvisorCookieHeader() },
      });
    }

    await prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { userId: user.id, publicToken: null },
    });

    logger.info("ai.public_conversation_adopted", { userId: user.id });

    return new Response(JSON.stringify({ adopted: true, conversationId: conversation.id }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": clearAdvisorCookieHeader() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = "force-dynamic";
