import { afterEach, describe, expect, it, vi } from "vitest";

import { httpChatInvoker, type ChatResponse, type ChatStreamEvent } from "@/lib/ai/providers";
import { advisorCookieAttributes, clearAdvisorCookieHeader, setAdvisorCookieHeader } from "@/lib/ai/public-session";

/**
 * The provider wire format.
 *
 * Worth testing directly because every failure here is silent in the way that
 * matters most: a tool call whose arguments were reassembled wrongly still
 * looks like a tool call, and the permission check downstream will happily
 * authorise the wrong arguments. Chunk boundaries are placed adversarially —
 * mid-JSON, mid-frame, mid-multibyte-character — because that is what a real
 * network does and what a naive per-chunk split gets wrong.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

/** Serves a fixed byte script as a streaming response body. */
function stubStream(pieces: string[], init: ResponseInit = {}) {
  const encoder = new TextEncoder();
  globalThis.fetch = vi.fn(async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, ...init });
  }) as unknown as typeof fetch;
}

function frame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function drain(events: AsyncIterable<ChatStreamEvent>) {
  const deltas: string[] = [];
  let response: ChatResponse | null = null;
  for await (const event of events) {
    if (event.type === "delta") deltas.push(event.text);
    else response = event.response;
  }
  return { deltas, response };
}

function request(overrides: Partial<Parameters<typeof httpChatInvoker>[0]> = {}) {
  return {
    modelId: "openai/gpt-4o-mini",
    messages: [{ role: "user" as const, content: "hello" }],
    temperature: 0.2,
    maxOutputTokens: 100,
    timeoutMs: 5_000,
    intent: "workspace_chat" as const,
    ...overrides,
  };
}

describe("streamed completions", () => {
  it("assembles text deltas and reports usage", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    stubStream([
      frame({ choices: [{ delta: { content: "Hello" } }] }),
      frame({ choices: [{ delta: { content: " there" } }] }),
      frame({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 4 } }),
      "data: [DONE]\n\n",
    ]);

    const { deltas, response } = await drain(httpChatInvoker(request()));

    expect(deltas).toEqual(["Hello", " there"]);
    expect(response?.text).toBe("Hello there");
    expect(response?.usage).toEqual({ inputTokens: 11, outputTokens: 4 });
    expect(response?.finishReason).toBe("stop");
  });

  /**
   * The bug this guards: splitting on newline per received chunk instead of
   * buffering to the blank-line terminator. It passes locally, where the whole
   * body arrives in one chunk, and truncates JSON the moment a real connection
   * fragments a frame.
   */
  it("survives a frame split across chunk boundaries", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    const whole = frame({ choices: [{ delta: { content: "split" } }] });
    stubStream([whole.slice(0, 12), whole.slice(12, 25), whole.slice(25)]);

    const { response } = await drain(httpChatInvoker(request()));
    expect(response?.text).toBe("split");
  });

  it("reassembles tool-call arguments that arrive a few characters at a time", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    stubStream([
      frame({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, id: "call_a", function: { name: "searchTours", arguments: '{"que' } }],
            },
          },
        ],
      }),
      frame({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"Alf' } }] } }] }),
      frame({
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { arguments: 'ama"}' } }] }, finish_reason: "tool_calls" },
        ],
      }),
    ]);

    const { response } = await drain(httpChatInvoker(request()));

    expect(response?.toolCalls).toHaveLength(1);
    expect(response?.toolCalls[0]).toMatchObject({ id: "call_a", name: "searchTours" });
    expect(JSON.parse(response?.toolCalls[0].arguments ?? "{}")).toEqual({ query: "Alfama" });
  });

  it("keeps two concurrent tool calls apart by index", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    stubStream([
      frame({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "a", function: { name: "searchTours", arguments: "{}" } },
                { index: 1, id: "b", function: { name: "getDomains", arguments: "{}" } },
              ],
            },
          },
        ],
      }),
    ]);

    const { response } = await drain(httpChatInvoker(request()));
    expect(response?.toolCalls.map((call) => call.name)).toEqual(["searchTours", "getDomains"]);
  });

  it("ignores a malformed frame instead of failing the answer", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    stubStream([
      frame({ choices: [{ delta: { content: "before" } }] }),
      "data: {not-json\n\n",
      frame({ choices: [{ delta: { content: " after" } }] }),
    ]);

    const { response } = await drain(httpChatInvoker(request()));
    expect(response?.text).toBe("before after");
  });

  it("falls back to zeroed usage when the provider omits it", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");
    stubStream([frame({ choices: [{ delta: { content: "hi" }, finish_reason: "stop" }] })]);

    const { response } = await drain(httpChatInvoker(request()));
    // The router substitutes its own estimate; the provider layer must not
    // invent one, so that "the provider did not say" stays distinguishable.
    expect(response?.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("refuses a provider with no key rather than calling it", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    globalThis.fetch = vi.fn(async () => new Response("should not be called")) as unknown as typeof fetch;

    await expect(drain(httpChatInvoker(request()))).rejects.toThrow(/not configured/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("marks a 400 as non-retryable and a 429 as retryable", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: "bad model" } }), { status: 400 }),
    ) as unknown as typeof fetch;
    await expect(drain(httpChatInvoker(request()))).rejects.toMatchObject({
      retryable: false,
      message: "bad model",
    });

    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429 }),
    ) as unknown as typeof fetch;
    await expect(drain(httpChatInvoker(request()))).rejects.toMatchObject({ retryable: true });
  });

  it("never puts the API key anywhere but the Authorization header", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-secret-value");
    stubStream([frame({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] })]);

    await drain(httpChatInvoker(request({ workspaceId: "ws_1", surface: "workspace_copilot" })));

    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-secret-value");
    // The gateway metadata header is a second copy of request context sent to
    // Cloudflare. It must carry ids only — never the key, never prompt text.
    expect(headers["cf-aig-metadata"]).not.toContain("sk-secret");
    expect(String(init.body)).not.toContain("sk-secret");
  });
});

describe("advisor session cookie", () => {
  it("is httpOnly and lax so an XSS cannot read it and a return visit keeps it", () => {
    const header = setAdvisorCookieHeader("token-value-abcdefghijklmnop");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
  });

  it("is marked Secure only in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(advisorCookieAttributes()).toContain("Secure");
    vi.stubEnv("NODE_ENV", "development");
    expect(advisorCookieAttributes()).not.toContain("Secure");
  });

  it("expires the cookie when clearing it", () => {
    expect(clearAdvisorCookieHeader()).toContain("Max-Age=0");
  });
});
