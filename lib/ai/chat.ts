import { randomBytes } from "node:crypto";

import type { AiSurface, Prisma } from "@prisma/client";

import { badRequest, forbidden, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

import { describeToolParameters } from "@/lib/ai/tool-schema";
import { groundingInstruction } from "@/lib/ai/prompts";
import { citationsFrom, formatChunksForPrompt, retrieve, type RetrievalScope } from "@/lib/ai/rag/retrieve";
import { runChatTask, type ChatContext } from "@/lib/ai/router";
import { sanitiseUserMessage, scanForInjection, validateModelOutput, wrapUntrusted } from "@/lib/ai/safety";
import { invokeTool, toolsForSurface, type RiskLevel, type ToolContext } from "@/lib/ai/tools";
import type { AiTask } from "@/lib/ai/tasks";
import type { ChatInvoker, ChatMessage, ChatToolSpec } from "@/lib/ai/providers";

/**
 * Conversation orchestration: history, retrieval, the tool loop, persistence.
 *
 * This is the only place a model turn is assembled, and it is deliberately
 * shared between the authenticated copilot and the anonymous public advisor.
 * Two surfaces with two loops would mean two chances to forget the untrusted
 * -content wrapper or the per-turn tool ceiling; here the difference between
 * them is a `surface` value and a retrieval scope, and everything safety
 * -relevant is structurally common.
 *
 * The tool loop is bounded twice over: at most `MAX_TOOL_ROUNDS` model turns
 * and at most `MAX_TOOL_CALLS` executions in total. Both matter. Rounds bound
 * cost and latency; total calls bound a single round that requests forty tools
 * at once, which a confused model does and which the round limit alone would
 * happily pay for.
 */

const MAX_TOOL_ROUNDS = 4;
const MAX_TOOL_CALLS = 10;
/** Turns replayed into the context window. Older turns live in `summary`. */
const HISTORY_LIMIT = 20;

export type ChatCitation = ReturnType<typeof citationsFrom>[number];

export type ToolActivity = {
  name: string;
  risk: RiskLevel;
  ok: boolean;
  /** Present for confirm/strong_confirm tools: what the model wants to change. */
  proposal?: unknown;
  error?: string;
};

export type TurnEvent =
  | { type: "delta"; text: string }
  | { type: "tool"; activity: ToolActivity }
  | { type: "citations"; citations: ChatCitation[] }
  | { type: "done"; conversationId: string; messageId: string; title: string | null }
  | { type: "error"; message: string };

/* ------------------------------------------------------------------------ */
/* Conversation records                                                      */
/* ------------------------------------------------------------------------ */

/**
 * A public session handle.
 *
 * 32 bytes of CSPRNG output, base64url. The token *is* the authorisation for an
 * anonymous thread, so it has to be unguessable in the same way a session
 * cookie is; a shorter or time-derived value would let one visitor walk into
 * another's conversation.
 */
export function newPublicToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createConversation(input: {
  workspaceId: string | null;
  userId: string | null;
  surface: AiSurface;
  title?: string | null;
}) {
  return prisma.aiConversation.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      surface: input.surface,
      title: input.title ?? null,
      publicToken: input.workspaceId ? null : newPublicToken(),
    },
  });
}

/**
 * Loads a workspace conversation.
 *
 * Filtered on `{ id, workspaceId }` in one query rather than fetched by id and
 * checked afterwards — the same rule `lib/sites/service.ts` follows, and for
 * the same reason: the two shapes look identical in review and only one of them
 * is safe.
 */
export async function getWorkspaceConversation(workspaceId: string, conversationId: string) {
  const conversation = await prisma.aiConversation.findFirst({
    where: { id: conversationId, workspaceId, archivedAt: null },
  });
  if (!conversation) throw notFound("Conversation not found.");
  return conversation;
}

export async function getPublicConversation(publicToken: string) {
  const conversation = await prisma.aiConversation.findUnique({ where: { publicToken } });
  // A public token must never resolve to a workspace-owned thread, even if one
  // somehow carried a token: that would hand an anonymous caller a tenant's
  // history.
  if (!conversation || conversation.workspaceId !== null) throw notFound("Conversation not found.");
  return conversation;
}

export async function listWorkspaceConversations(workspaceId: string, userId: string) {
  return prisma.aiConversation.findMany({
    where: { workspaceId, userId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
}

/**
 * The most recent turns, oldest first.
 *
 * Ordered by `sequence`, never by `createdAt`. The two messages of a single
 * exchange are written in one transaction and therefore share a timestamp to
 * the microsecond, so a timestamp sort returns the answer before the question
 * roughly half the time — and the model then reads a transcript in which it
 * spoke first.
 */
export async function conversationMessages(conversationId: string, take = HISTORY_LIMIT) {
  const rows = await prisma.aiConversationMessage.findMany({
    where: { conversationId },
    orderBy: { sequence: "desc" },
    take,
  });
  return rows.reverse();
}

/* ------------------------------------------------------------------------ */
/* Turn execution                                                            */
/* ------------------------------------------------------------------------ */

export type RunTurnInput = {
  conversationId: string;
  surface: AiSurface;
  task: AiTask;
  systemPrompt: string;
  userMessage: string;
  /** Verified server-side; never read from the request body. */
  workspaceId: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  /** Omit to skip retrieval entirely for this surface. */
  retrievalScope?: RetrievalScope;
  requestId?: string;
  invoker?: ChatInvoker;
};

function toolSpecs(isAuthenticated: boolean): ChatToolSpec[] {
  return toolsForSurface(isAuthenticated).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: describeToolParameters(tool.input),
  }));
}

/**
 * Serialises a tool result for the model.
 *
 * Capped, because a tool that returns 25 tours produces a few kilobytes of JSON
 * and four of those in one turn will push the system prompt out of a small
 * context window — an injection technique that requires no cleverness at all,
 * just volume.
 */
function serialiseToolResult(value: unknown): string {
  const text = JSON.stringify(value ?? null);
  return text.length > 12_000 ? `${text.slice(0, 12_000)}… (truncated)` : text;
}

/**
 * Runs one user turn to completion, yielding events as they happen.
 *
 * An async generator rather than a callback API because the caller is an SSE
 * route: `for await` over this maps one-to-one onto writing frames, and
 * back-pressure from a slow client naturally stops us pulling more from the
 * provider.
 */
export async function* runTurn(input: RunTurnInput): AsyncGenerator<TurnEvent> {
  const cleaned = sanitiseUserMessage(input.userMessage);
  if (cleaned.length === 0) throw badRequest("Message cannot be empty.");

  const scan = scanForInjection(cleaned);
  if (scan.suspicious) {
    // Logged, not blocked. An operator can legitimately ask "how do I write a
    // system prompt for my chatbot?", and a filter that refuses real questions
    // is a filter someone turns off. The controls that matter run regardless.
    logger.warn("ai.injection_signal", {
      workspaceId: input.workspaceId ?? undefined,
      surface: input.surface,
      rules: scan.matchedRules.join(","),
    });
  }

  const history = await conversationMessages(input.conversationId);

  /* Retrieval ----------------------------------------------------------- */

  let citations: ChatCitation[] = [];
  let groundingBlock = "";
  if (input.retrievalScope) {
    try {
      const result = await retrieve({ query: cleaned, scope: input.retrievalScope, topK: 5 });
      citations = citationsFrom(result.chunks);
      groundingBlock = formatChunksForPrompt(result.chunks);
    } catch (error) {
      // Retrieval failure degrades to an ungrounded answer rather than an
      // error page. The model is told the documents are missing, so it says it
      // does not know instead of confabulating.
      logger.error("ai.retrieval_failed", { surface: input.surface }, error);
    }
    yield { type: "citations", citations };
  }

  /* Message assembly ---------------------------------------------------- */

  const messages: ChatMessage[] = [{ role: "system", content: input.systemPrompt }];

  for (const row of history) {
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (!row.content.trim()) continue;
    messages.push({ role: row.role, content: row.content });
  }

  if (input.retrievalScope) {
    messages.push({
      role: "system",
      content: `${groundingInstruction(citations.length)}\n\n${
        groundingBlock ? wrapUntrusted(groundingBlock) : ""
      }`.trim(),
    });
  }

  messages.push({ role: "user", content: cleaned });

  const context: ChatContext = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    surface: input.surface,
    requestId: input.requestId,
  };
  const toolContext: ToolContext = {
    userId: input.userId ?? "anonymous",
    workspaceId: input.workspaceId,
    isAuthenticated: input.isAuthenticated,
    requestId: input.requestId,
  };

  const specs = toolSpecs(input.isAuthenticated);
  const activities: ToolActivity[] = [];
  let answer = "";
  let toolCallBudget = MAX_TOOL_CALLS;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const streamed: string[] = [];
    const result = await runChatTask({
      task: input.task,
      messages,
      tools: specs.length > 0 ? specs : undefined,
      context,
      invoker: input.invoker,
      onDelta: (text) => streamed.push(text),
    });

    // Deltas are buffered per round and flushed here rather than yielded from
    // inside the callback: a generator cannot yield from a synchronous callback,
    // and the alternative (a queue) would add latency without adding value —
    // the round completes before any tool result exists to show anyway.
    for (const text of streamed) yield { type: "delta", text };
    if (result.text) answer += result.text;

    if (result.toolCalls.length === 0) break;

    messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });

    for (const call of result.toolCalls) {
      if (toolCallBudget <= 0) {
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({ error: "Tool call limit reached for this turn." }),
        });
        continue;
      }
      toolCallBudget -= 1;

      let args: unknown = {};
      try {
        args = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        // Malformed JSON is a model error, not a server error. Telling it so
        // lets it retry with valid arguments inside the same turn.
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify({ error: "Arguments were not valid JSON." }),
        });
        continue;
      }

      const outcome = await invokeTool(call.name, args, toolContext);
      const activity: ToolActivity = outcome.ok
        ? {
            name: outcome.name,
            risk: outcome.risk,
            ok: true,
            proposal: outcome.risk === "auto" ? undefined : outcome.result,
          }
        : { name: outcome.name, risk: "auto", ok: false, error: outcome.error };

      activities.push(activity);
      yield { type: "tool", activity };

      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: outcome.ok
          ? serialiseToolResult(outcome.result)
          : JSON.stringify({ error: outcome.error }),
      });
    }
  }

  /* Output validation --------------------------------------------------- */

  const validation = validateModelOutput(answer);
  if (!validation.ok) {
    logger.error("ai.output_rejected", { surface: input.surface, reason: validation.reason });
    answer =
      "I generated a response that failed a safety check, so I have not shown it. Please rephrase your question.";
  }

  if (!answer.trim() && activities.length === 0) {
    answer = "I could not produce an answer for that. Try rephrasing the question.";
  }

  /* Persistence --------------------------------------------------------- */

  const { assistantMessage, conversation } = await prisma.$transaction(async (tx) => {
    // Read the high-water mark inside the transaction. Two turns racing on one
    // thread will collide on the unique index rather than interleave, which is
    // the right failure: a scrambled transcript is silently wrong, a rejected
    // second submit is visibly retryable.
    const last = await tx.aiConversationMessage.aggregate({
      where: { conversationId: input.conversationId },
      _max: { sequence: true },
    });
    const base = (last._max.sequence ?? 0) + 1;

    await tx.aiConversationMessage.create({
      data: {
        conversationId: input.conversationId,
        sequence: base,
        role: "user",
        content: cleaned,
      },
    });
    const created = await tx.aiConversationMessage.create({
      data: {
        conversationId: input.conversationId,
        sequence: base + 1,
        role: "assistant",
        content: answer,
        toolCalls: activities as unknown as Prisma.InputJsonValue,
        citations: citations as unknown as Prisma.InputJsonValue,
      },
    });
    const updated = await tx.aiConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });
    return { assistantMessage: created, conversation: updated };
  });

  // Title from the first user message. Derived locally rather than with a
  // second model call: a thread list needs a recognisable label, not a clever
  // one, and a summarisation call per conversation is a real cost for a
  // cosmetic gain.
  let title = conversation.title;
  if (!title) {
    title = cleaned.length > 60 ? `${cleaned.slice(0, 57).trimEnd()}…` : cleaned;
    await prisma.aiConversation.update({ where: { id: conversation.id }, data: { title } });
  }

  yield { type: "done", conversationId: input.conversationId, messageId: assistantMessage.id, title };
}

/* ------------------------------------------------------------------------ */
/* SSE framing                                                               */
/* ------------------------------------------------------------------------ */

/**
 * Wraps a turn as a `text/event-stream` body.
 *
 * Errors are emitted as an `error` event and the stream is closed normally. An
 * SSE response has already sent its 200 by the time a provider fails, so
 * throwing here would surface to the browser as a truncated stream with no
 * explanation; a terminal event lets the UI say what happened.
 */
export function turnToSseStream(events: AsyncGenerator<TurnEvent>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (event: TurnEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        for await (const event of events) send(event);
      } catch (error) {
        const message =
          error instanceof Error && "status" in error
            ? error.message
            : "The assistant could not complete that request.";
        logger.error("ai.turn_failed", undefined, error);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
}

export function assertConversationOwner(
  conversation: { userId: string | null; workspaceId: string | null },
  userId: string,
) {
  // Threads are per-user inside a workspace. A colleague's copilot conversation
  // can contain drafts and analysis they have not shared, and workspace
  // membership is not consent to read it.
  if (conversation.userId && conversation.userId !== userId) {
    throw forbidden("This conversation belongs to another member.");
  }
}
