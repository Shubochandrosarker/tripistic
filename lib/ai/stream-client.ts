"use client";

/**
 * Browser-side reader for the chat SSE endpoints.
 *
 * Shared by the workspace Copilot and the public Travel Advisor so the framing
 * is parsed in exactly one place. The two surfaces disagree about a lot —
 * authentication, tools, retrieval scope — but they emit the same event
 * envelope, and a second parser would be a second place for a partially
 * -received frame to be mis-handled.
 *
 * `EventSource` is not usable here: it only issues GET requests, and a chat
 * turn is a POST with a JSON body. So the stream is read from `fetch` and
 * framed by hand, which is also why the buffering below matters — a chunk
 * boundary lands mid-JSON regularly under real network conditions, and
 * splitting per-chunk instead of on the blank-line terminator produces a parse
 * error that only reproduces on slow connections.
 */

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool"; activity: { name: string; risk: string; ok: boolean; proposal?: unknown; error?: string } }
  | { type: "citations"; citations: Array<{ ref: number; title: string; documentId: string }> }
  | { type: "done"; conversationId: string; messageId: string; title: string | null }
  | { type: "error"; message: string };

export type StreamHandlers = {
  onEvent: (event: StreamEvent) => void;
  signal?: AbortSignal;
};

export async function streamChat(
  url: string,
  body: unknown,
  { onEvent, signal }: StreamHandlers,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    // A non-streaming failure still returns JSON — a 402 upgrade prompt, a 429,
    // a 503 when no provider is configured. Surfacing the server's own message
    // is the difference between "upgrade to use the Copilot" and "something
    // went wrong".
    let message = "The assistant is unavailable right now.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      /* keep the default */
    }
    onEvent({ type: "error", message });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            onEvent(JSON.parse(payload) as StreamEvent);
          } catch {
            /* a malformed frame is dropped; the next one carries the state */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
