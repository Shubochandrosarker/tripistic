import { handleApiError, json, noStoreJson } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

import {
  assertConversationOwner,
  conversationMessages,
  getWorkspaceConversation,
} from "@/lib/ai/chat";

type Params = { params: Promise<{ id: string; conversationId: string }> };

/** Full transcript of one thread. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, conversationId } = await params;
    await requireWorkspaceAccess(user.id, id, { feature: "ai_copilot" });

    const conversation = await getWorkspaceConversation(id, conversationId);
    assertConversationOwner(conversation, user.id);

    // 200 turns, not all of them: a long-running thread should still render,
    // and the model only ever sees the recent window anyway.
    const messages = await conversationMessages(conversationId, 200);

    return noStoreJson({
      conversation: { id: conversation.id, title: conversation.title, createdAt: conversation.createdAt },
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        toolCalls: message.toolCalls,
        citations: message.citations,
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Archives a thread.
 *
 * A soft archive rather than a delete. Conversations can contain the reasoning
 * behind a change an operator later needs to explain, and "I deleted the chat"
 * should not also mean "the record of what the assistant proposed is gone".
 * `archivedAt` hides it from the list and from every read path.
 */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, conversationId } = await params;
    await requireWorkspaceAccess(user.id, id, { feature: "ai_copilot" });

    const conversation = await getWorkspaceConversation(id, conversationId);
    assertConversationOwner(conversation, user.id);

    await prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { archivedAt: new Date() },
    });

    return json({ archived: true });
  } catch (error) {
    return handleApiError(error);
  }
}
