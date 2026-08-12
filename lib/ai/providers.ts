import { gatewayBaseUrl, gatewayHeaders } from "@/lib/cloudflare/ai-gateway";
import { cloudflareApiToken, cloudflareConfig } from "@/lib/cloudflare/config";

import type { GatewayIntent } from "@/lib/cloudflare/ai-gateway";

/**
 * Chat-completion providers.
 *
 * `lib/ai/tasks.ts` has always described *which* model each task should prefer,
 * and `lib/ai/usage.ts` has always been able to meter a call — but nothing in
 * the codebase actually made one. This file is that missing half: the thing
 * that turns `openai/gpt-4o-mini` into an HTTP request.
 *
 * Three decisions shape it.
 *
 * **One wire format.** OpenAI, OpenRouter, Groq and Cloudflare Workers AI all
 * expose an OpenAI-compatible `/chat/completions`, so there is exactly one
 * request builder and one response parser. A second dialect would be a second
 * place for tool-call parsing to drift, and tool-call parsing is the part that
 * decides whether a permission check runs.
 *
 * **No fallback to a fake answer.** `lib/ai/rag/embeddings.ts` degrades to a
 * deterministic hash when Workers AI is absent, and that is correct there: a
 * meaningless vector still exercises the isolation filter, which is what the
 * test needs. The same trick would be indefensible here. A synthesised reply is
 * indistinguishable, to the person reading it, from a real one — so when no
 * provider is configured this layer refuses, loudly, and the surfaces above it
 * tell the user the assistant is unavailable. Tests inject a stub through
 * `ChatInvoker` rather than having production code pretend.
 *
 * **Secrets never leave the server.** Keys are read at call time and go
 * straight into an Authorization header. Nothing here returns one, and
 * `providerStatus()` reports only whether a key is present, so the admin health
 * view can be rendered without a redaction pass.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ChatToolCall = {
  id: string;
  name: string;
  /** Raw JSON string as emitted by the model. Parsed and validated upstream. */
  arguments: string;
};

export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** Present on assistant turns that requested tools. */
  toolCalls?: ChatToolCall[];
  /** Present on tool-result turns; ties the result to the request. */
  toolCallId?: string;
  name?: string;
};

export type ChatToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatRequest = {
  modelId: string;
  messages: ChatMessage[];
  tools?: ChatToolSpec[];
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  intent: GatewayIntent;
  requestId?: string;
  workspaceId?: string;
  surface?: string;
};

export type ChatUsage = { inputTokens: number; outputTokens: number };

export type ChatResponse = {
  text: string;
  toolCalls: ChatToolCall[];
  usage: ChatUsage;
  finishReason: string;
};

/** A streamed fragment. `done` carries the assembled result. */
export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; response: ChatResponse };

/**
 * The seam every caller goes through.
 *
 * Exported as a type so tests can supply their own implementation instead of
 * monkey-patching a module. `lib/ai/router.ts` accepts one on every call.
 */
export type ChatInvoker = (request: ChatRequest) => AsyncIterable<ChatStreamEvent>;

/* ------------------------------------------------------------------------ */
/* Provider resolution                                                       */
/* ------------------------------------------------------------------------ */

export type ProviderId = "openai" | "openrouter" | "groq" | "workers-ai";

const PROVIDER_IDS: ProviderId[] = ["openai", "openrouter", "groq", "workers-ai"];

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as string[]).includes(value);
}

function envKey(provider: ProviderId): string | undefined {
  const raw =
    provider === "openai"
      ? process.env.OPENAI_API_KEY
      : provider === "openrouter"
        ? process.env.OPENROUTER_API_KEY
        : provider === "groq"
          ? process.env.GROQ_API_KEY
          : cloudflareApiToken();
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Whether a provider can be called right now.
 *
 * Workers AI additionally needs an account id — a token alone addresses
 * nothing, and reporting it as ready would turn a configuration gap into a
 * runtime 400 the operator has to decode from a log line.
 */
export function isProviderConfigured(provider: ProviderId): boolean {
  if (!envKey(provider)) return false;
  if (provider === "workers-ai") return Boolean(cloudflareConfig().accountId);
  return true;
}

export function configuredProviders(): ProviderId[] {
  return PROVIDER_IDS.filter(isProviderConfigured);
}

/** True when at least one chat provider can serve a request. */
export function isChatAvailable(): boolean {
  return configuredProviders().length > 0;
}

/** Shape the admin health view renders. Contains no secret material. */
export function providerStatus(): Array<{ provider: ProviderId; configured: boolean; viaGateway: boolean }> {
  return PROVIDER_IDS.map((provider) => ({
    provider,
    configured: isProviderConfigured(provider),
    viaGateway: gatewayBaseUrl(provider) !== null,
  }));
}

/**
 * Base URL for a provider's OpenAI-compatible surface.
 *
 * The AI Gateway is preferred whenever it is configured, because that is where
 * per-request cost attribution and retry policy live. Falling through to the
 * provider's own host when it is not means losing analytics, not losing the
 * feature.
 */
function baseUrl(provider: ProviderId): string {
  const gateway = gatewayBaseUrl(provider);
  if (gateway) {
    // Workers AI behind the gateway still needs the OpenAI-compatible suffix;
    // the hosted providers already carry their version segment.
    return provider === "workers-ai" ? `${gateway}/v1` : gateway;
  }
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "groq":
      return "https://api.groq.com/openai/v1";
    case "workers-ai": {
      const accountId = cloudflareConfig().accountId;
      return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
    }
  }
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
    /** Whether trying the next model in the task profile is worth doing. */
    readonly retryable = true,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export class AiUnavailableError extends Error {
  constructor(message = "No AI provider is configured for this deployment.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/* ------------------------------------------------------------------------ */
/* Wire format                                                               */
/* ------------------------------------------------------------------------ */

function toWireMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return { role: "tool", content: message.content, tool_call_id: message.toolCallId };
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function toWireTools(tools: ChatToolSpec[] | undefined) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

/**
 * Accumulates streamed `tool_calls` deltas.
 *
 * Providers emit a tool call across many chunks: the id and name arrive once,
 * then the argument JSON arrives a few characters at a time, keyed only by
 * array index. Reassembling by index rather than by id is not a shortcut — the
 * id is absent from every chunk after the first, so index is the only join key
 * the protocol offers.
 */
class ToolCallAccumulator {
  private readonly slots = new Map<number, { id: string; name: string; arguments: string }>();

  push(index: number, delta: { id?: string; function?: { name?: string; arguments?: string } }) {
    const slot = this.slots.get(index) ?? { id: "", name: "", arguments: "" };
    if (delta.id) slot.id = delta.id;
    if (delta.function?.name) slot.name = delta.function.name;
    if (delta.function?.arguments) slot.arguments += delta.function.arguments;
    this.slots.set(index, slot);
  }

  toArray(): ChatToolCall[] {
    return [...this.slots.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, slot]) => ({
        // A provider that omits the id entirely still has to produce something
        // stable, because the tool-result message must reference it.
        id: slot.id || `call_${index}`,
        name: slot.name,
        arguments: slot.arguments || "{}",
      }))
      .filter((call) => call.name.length > 0);
  }
}

type StreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

/**
 * Parses one `text/event-stream` body into chat events.
 *
 * Written against the raw byte stream rather than a library because the only
 * framing rule that matters is "events are separated by a blank line, data
 * lines are prefixed `data: `", and a partial chunk must be held until its
 * terminator arrives. Splitting on newline per-chunk without a buffer is the
 * classic bug here: it works locally and truncates JSON under real network
 * fragmentation.
 */
async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ text: string; chunk: StreamChunk }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const rawEvent = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf("\n\n");

        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "" || payload === "[DONE]") continue;
          let parsed: StreamChunk;
          try {
            parsed = JSON.parse(payload) as StreamChunk;
          } catch {
            // A single malformed frame is not worth failing a whole answer
            // over; the stream carries redundant state and the next frame
            // usually recovers.
            continue;
          }
          yield { text: parsed.choices?.[0]?.delta?.content ?? "", chunk: parsed };
        }
      }
    }
  } finally {
    // Releasing matters on the abort path: an un-released reader keeps the
    // socket open until GC, and a timed-out request that holds its connection
    // is how a burst of slow calls exhausts the pool.
    reader.releaseLock();
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string };
    if (typeof body.error === "string") return body.error;
    if (body.error?.message) return body.error.message;
  } catch {
    /* fall through to the status-only message */
  }
  return `Provider responded with status ${response.status}.`;
}

/* ------------------------------------------------------------------------ */
/* The invoker                                                               */
/* ------------------------------------------------------------------------ */

/**
 * Calls a provider and streams the result.
 *
 * `stream_options.include_usage` is requested because a streamed response
 * otherwise reports no token counts at all, and a metering system that guesses
 * its inputs is a metering system that disagrees with the invoice. Providers
 * that ignore the flag fall back to an estimate, which the usage event records
 * as such.
 */
export const httpChatInvoker: ChatInvoker = async function* httpChatInvoker(request) {
  const separator = request.modelId.indexOf("/");
  const providerName = separator === -1 ? "openai" : request.modelId.slice(0, separator);
  const model = separator === -1 ? request.modelId : request.modelId.slice(separator + 1);

  if (!isProviderId(providerName)) {
    throw new AiProviderError(`Unknown provider: ${providerName}`, providerName, undefined, false);
  }
  const key = envKey(providerName);
  if (!key || !isProviderConfigured(providerName)) {
    throw new AiProviderError(
      `${providerName} is not configured.`,
      providerName,
      undefined,
      // Retryable across models: the next entry in the task profile may be on a
      // provider that *is* configured.
      true,
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...gatewayHeaders({
      intent: request.intent,
      requestId: request.requestId,
      workspaceId: request.workspaceId,
      surface: request.surface,
    }),
  };
  if (providerName === "openrouter") {
    // OpenRouter attributes traffic by these; omitting them is allowed but
    // costs the account its per-app analytics.
    headers["HTTP-Referer"] = process.env.APP_URL ?? "https://app.tripistic.com";
    headers["X-Title"] = "Tripistic";
  }

  const response = await fetch(`${baseUrl(providerName)}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: toWireMessages(request.messages),
      tools: toWireTools(request.tools),
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: AbortSignal.timeout(request.timeoutMs),
  });

  if (!response.ok || !response.body) {
    const message = await errorMessage(response);
    throw new AiProviderError(
      message,
      providerName,
      response.status,
      // 4xx other than 429 means the request itself is wrong; retrying the same
      // payload against a different model of the same shape will fail the same
      // way. 429 and 5xx are worth another model.
      response.status === 429 || response.status >= 500,
    );
  }

  const toolCalls = new ToolCallAccumulator();
  let text = "";
  let finishReason = "stop";
  let usage: ChatUsage | null = null;

  for await (const { text: delta, chunk } of parseSse(response.body)) {
    if (delta) {
      text += delta;
      yield { type: "delta", text: delta };
    }
    const choice = chunk.choices?.[0];
    for (const call of choice?.delta?.tool_calls ?? []) {
      toolCalls.push(call.index ?? 0, call);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk.usage) {
      usage = {
        inputTokens: chunk.usage.prompt_tokens ?? 0,
        outputTokens: chunk.usage.completion_tokens ?? 0,
      };
    }
  }

  yield {
    type: "done",
    response: {
      text,
      toolCalls: toolCalls.toArray(),
      usage: usage ?? { inputTokens: 0, outputTokens: 0 },
      finishReason,
    },
  };
};
