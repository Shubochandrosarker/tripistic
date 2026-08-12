import type { AiSurface } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { logger } from "@/lib/observability/logger";

import {
  AiProviderError,
  AiUnavailableError,
  httpChatInvoker,
  isChatAvailable,
  isProviderConfigured,
  isProviderId,
  type ChatInvoker,
  type ChatMessage,
  type ChatResponse,
  type ChatToolSpec,
} from "@/lib/ai/providers";
import { estimateTokens, parseModelId, taskProfile, type AiTask } from "@/lib/ai/tasks";
import {
  assertCredits,
  consumeCredits,
  estimateCostMillicents,
  recordUsageEvent,
} from "@/lib/ai/usage";

/**
 * The model router.
 *
 * One function decides which model serves a task, enforces the plan's budget,
 * bounds the request, streams the answer, and records what it cost. Everything
 * above it — the copilot, the public advisor, site generation — names a *task*
 * and never a model, which is the indirection `lib/ai/tasks.ts` was written to
 * enable.
 *
 * Ordering inside `runChatTask` is the part worth reading carefully, because it
 * is a sequence of deliberate choices rather than an arbitrary one:
 *
 *   1. **Availability before anything.** A deployment with no provider key gets
 *      a clean 503, not a half-charged credit and a stack trace.
 *   2. **Budget before the call.** `assertCredits` throws 402 up front. A limit
 *      checked afterwards is not a limit, it is an invoice.
 *   3. **Size before the call.** An oversized prompt is refused locally rather
 *      than paid for and then rejected by the provider.
 *   4. **Charge on success only.** A failed call still writes a usage *event*
 *      (a month where 40% of calls errored is the most useful thing to know
 *      about an AI feature) but does not decrement the customer's credits.
 *
 * Fallback walks the task's `preferredModels` in order. It stops early on a
 * non-retryable provider error — a malformed request will fail identically
 * against the next model, and retrying it just spends latency to reach the same
 * message.
 */

export type ChatContext = {
  workspaceId: string | null;
  userId: string | null;
  surface: AiSurface;
  requestId?: string;
};

export type RunChatOptions = {
  task: AiTask;
  messages: ChatMessage[];
  tools?: ChatToolSpec[];
  context: ChatContext;
  /** Overrides the task profile's cap when a surface needs a shorter answer. */
  maxOutputTokens?: number;
  /** Test seam. Production always uses the HTTP invoker. */
  invoker?: ChatInvoker;
  /** Called for each streamed fragment. */
  onDelta?: (text: string) => void;
};

export type RunChatResult = ChatResponse & {
  modelId: string;
  provider: string;
  latencyMs: number;
  /** Credits actually charged. Zero for unmetered (anonymous) surfaces. */
  creditsCharged: number;
};

/**
 * Models to try, in order, filtered to providers that can actually be called.
 *
 * Filtering here rather than discovering it mid-flight means the common
 * misconfiguration — a task whose first-choice provider has no key — costs
 * nothing instead of one failed round trip per request.
 */
export function candidateModels(task: AiTask): string[] {
  const profile = taskProfile(task);
  const available = profile.preferredModels.filter((modelId) => {
    const { provider } = parseModelId(modelId);
    return isProviderId(provider) && isProviderConfigured(provider);
  });
  // If nothing matches we return the raw list so the resulting error names a
  // real model rather than "none", which is easier to act on.
  return available.length > 0 ? available : profile.preferredModels;
}

function promptSize(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateTokens(message.content), 0);
}

/**
 * Runs one model turn.
 *
 * Returns the assembled response; fragments are delivered through `onDelta` as
 * they arrive so a caller can forward them to an SSE stream without buffering
 * the whole answer first.
 */
export async function runChatTask(options: RunChatOptions): Promise<RunChatResult> {
  const profile = taskProfile(options.task);
  const { context } = options;

  if (!options.invoker && !isChatAvailable()) {
    throw new ApiError(
      503,
      "The AI assistant is not available on this deployment. No model provider is configured.",
    );
  }

  // Anonymous public callers have no workspace and therefore no credit meter.
  // Their spend is bounded by rate limiting on the route instead; see
  // app/api/ai/public/chat.
  if (context.workspaceId) {
    await assertCredits(context.workspaceId, profile.creditCost);
  }

  const inputEstimate = promptSize(options.messages);
  if (inputEstimate > profile.maxInputTokens) {
    throw new ApiError(
      413,
      "This conversation is too long to send. Start a new thread and the assistant will keep up.",
    );
  }

  const invoke = options.invoker ?? httpChatInvoker;
  const maxOutputTokens = Math.min(
    options.maxOutputTokens ?? profile.maxOutputTokens,
    profile.maxOutputTokens,
  );

  let lastError: unknown = new AiUnavailableError();

  for (const modelId of candidateModels(options.task)) {
    const { provider, model } = parseModelId(modelId);
    const startedAt = Date.now();

    try {
      let response: ChatResponse | null = null;
      for await (const event of invoke({
        modelId,
        messages: options.messages,
        tools: options.tools,
        temperature: profile.temperature,
        maxOutputTokens,
        timeoutMs: profile.timeoutMs,
        intent: profile.gatewayIntent,
        requestId: context.requestId,
        workspaceId: context.workspaceId ?? undefined,
        surface: context.surface,
      })) {
        if (event.type === "delta") {
          options.onDelta?.(event.text);
        } else {
          response = event.response;
        }
      }

      if (!response) throw new AiProviderError("Provider closed the stream early.", provider);

      const latencyMs = Date.now() - startedAt;
      // Providers that ignore `include_usage` report zeros. Falling back to the
      // local estimate keeps cost attribution roughly right rather than
      // recording a month of free calls.
      const inputTokens = response.usage.inputTokens || inputEstimate;
      const outputTokens = response.usage.outputTokens || estimateTokens(response.text);

      await recordUsageEvent({
        workspaceId: context.workspaceId,
        userId: context.userId,
        surface: context.surface,
        task: options.task,
        provider,
        model,
        inputTokens,
        outputTokens,
        estimatedCostMillicents: estimateCostMillicents(modelId, inputTokens, outputTokens),
        latencyMs,
        success: true,
        requestId: context.requestId,
      });

      let creditsCharged = 0;
      if (context.workspaceId && profile.creditCost > 0) {
        await consumeCredits(context.workspaceId, profile.creditCost);
        creditsCharged = profile.creditCost;
      }

      return { ...response, modelId, provider, latencyMs, creditsCharged };
    } catch (error) {
      lastError = error;
      const latencyMs = Date.now() - startedAt;

      await recordUsageEvent({
        workspaceId: context.workspaceId,
        userId: context.userId,
        surface: context.surface,
        task: options.task,
        provider,
        model,
        inputTokens: inputEstimate,
        outputTokens: 0,
        estimatedCostMillicents: 0,
        latencyMs,
        success: false,
        errorType: error instanceof Error ? error.name : "unknown",
        requestId: context.requestId,
      });

      logger.warn(
        "ai.model_call_failed",
        { task: options.task, modelId, workspaceId: context.workspaceId ?? undefined },
        error,
      );

      if (error instanceof AiProviderError && !error.retryable) break;
      // A caller-cancelled request must not walk the fallback list; the user
      // has already navigated away and every further attempt is pure cost.
      if (error instanceof Error && error.name === "AbortError") break;
    }
  }

  if (lastError instanceof ApiError) throw lastError;
  throw new ApiError(
    502,
    "The AI assistant could not complete that request. Please try again in a moment.",
  );
}
