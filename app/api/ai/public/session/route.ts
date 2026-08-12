import { handleApiError, noStoreJson } from "@/lib/api";

import { conversationMessages, getPublicConversation } from "@/lib/ai/chat";
import { clearAdvisorCookieHeader, readAdvisorToken } from "@/lib/ai/public-session";

/**
 * Restores the visitor's advisor thread on page load.
 *
 * The token comes from the httpOnly cookie only. There is deliberately no
 * `?token=` variant: a conversation handle in a URL travels in `Referer`
 * headers and shared links, and a handle that is also the only authorisation
 * must not travel at all.
 */
export async function GET() {
  try {
    const token = await readAdvisorToken();
    if (!token) return noStoreJson({ conversation: null, messages: [] });

    const conversation = await getPublicConversation(token).catch(() => null);
    if (!conversation) {
      // The cookie points at nothing — an expired or pruned thread. Clearing it
      // stops the client retrying a dead handle on every load.
      return new Response(JSON.stringify({ conversation: null, messages: [] }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie": clearAdvisorCookieHeader(),
        },
      });
    }

    const messages = await conversationMessages(conversation.id, 100);
    return noStoreJson({
      conversation: { id: conversation.id, title: conversation.title },
      messages: messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          citations: message.citations,
        })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = "force-dynamic";
