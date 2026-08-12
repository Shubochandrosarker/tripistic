"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Compass, Briefcase } from "lucide-react";

import { ChatComposer } from "@/components/ai/chat-composer";
import { ChatThread, type ChatMessageView } from "@/components/ai/chat-thread";
import { streamChat, type StreamEvent } from "@/lib/ai/stream-client";
import { trackEvent } from "@/lib/analytics/events";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The public Travel Advisor.
 *
 * Two modes, one thread. Travel mode helps a visitor plan and find real
 * experiences; Business mode answers "should I run my tours on this?". They
 * share a conversation because a person often arrives as a traveller and
 * leaves as an operator, and forcing a restart at that moment loses the
 * context that made them curious.
 *
 * What this component deliberately does not do is invent inventory. Every tour
 * it shows came back from a tool call the server made; there is no client-side
 * list of "popular tours" to fall back on, because a plausible fabricated tour
 * is worse for a marketplace than an empty result.
 */

type Mode = "travel" | "business";

const SUGGESTIONS: Record<Mode, string[]> = {
  travel: [
    "Three days in Rome with two kids",
    "Best food tours in Lisbon",
    "A walking tour somewhere quiet in Kyoto",
    "What should I book first for a week in Peru?",
  ],
  business: [
    "How do I start taking bookings as an independent guide?",
    "Can I use my own domain for the booking site?",
    "How does Tripistic handle payments and payouts?",
    "What is included in the plans?",
  ],
};

let localId = 0;
const nextId = (prefix: string) => `${prefix}-${(localId += 1)}`;

export function TravelAdvisor({ initialMode = "travel" }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sessionTracked = useRef(false);

  // Restore the visitor's thread from the httpOnly cookie. Failure is silent:
  // a returning visitor with an expired session should see a fresh advisor,
  // not an error about a cookie they never knew existed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/ai/public/session");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          messages: Array<{ id: string; role: string; content: string; citations?: ChatMessageView["citations"] }>;
        };
        if (cancelled || payload.messages.length === 0) return;
        setMessages(
          payload.messages.map((message) => ({
            id: message.id,
            role: message.role as "user" | "assistant",
            content: message.content,
            citations: message.citations ?? [],
          })),
        );
      } finally {
        if (!cancelled) setRestored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      if (!sessionTracked.current) {
        trackEvent("ai_session", { mode });
        sessionTracked.current = true;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const assistantId = nextId("assistant");

      setError(null);
      setBusy(true);
      setMessages((current) => [
        ...current,
        { id: nextId("user"), role: "user", content: text },
        { id: assistantId, role: "assistant", content: "", pending: true, citations: [] },
      ]);

      const patch = (update: (message: ChatMessageView) => ChatMessageView) =>
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? update(message) : message)),
        );

      const handle = (event: StreamEvent) => {
        if (event.type === "delta") {
          patch((message) => ({ ...message, content: message.content + event.text }));
        } else if (event.type === "tool") {
          // A successful tour lookup is the conversion signal worth recording.
          // It says the advisor surfaced real inventory — not that the visitor
          // booked because of it, which the data cannot show.
          if (event.activity.ok && event.activity.name === "searchPublicTours") {
            trackEvent("tour_recommended", { mode });
          }
        } else if (event.type === "citations") {
          patch((message) => ({ ...message, citations: event.citations }));
        } else if (event.type === "error") {
          setError(event.message);
          patch((message) => ({ ...message, pending: false }));
        } else if (event.type === "done") {
          patch((message) => ({ ...message, id: event.messageId, pending: false }));
        }
      };

      try {
        await streamChat("/api/ai/public/chat", { message: text, mode }, {
          onEvent: handle,
          signal: controller.signal,
        });
      } catch (streamError) {
        if ((streamError as Error).name !== "AbortError") {
          setError("The connection dropped before the answer finished.");
        }
        patch((message) => ({ ...message, pending: false }));
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [mode],
  );

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    trackEvent("ai_mode_switch", { mode: next });
  }

  const hasConversation = messages.length > 0;

  return (
    <div className="flex min-h-[36rem] flex-col overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div role="tablist" aria-label="Advisor mode" className="flex gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["travel", "Plan a trip", Compass],
              ["business", "Run tours", Briefcase],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={mode === value}
              onClick={() => switchMode(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === value
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon aria-hidden className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {hasConversation ? (
          <ButtonLink
            href="/register"
            size="sm"
            variant="secondary"
            onClick={() => trackEvent("signup_started", { source: "travel_advisor" })}
          >
            Save this conversation
          </ButtonLink>
        ) : null}
      </div>

      <ChatThread
        messages={messages}
        error={error}
        emptyState={
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-lg font-semibold text-foreground">
              {mode === "travel"
                ? "Where are you thinking of going?"
                : "What would you like to know about running tours on Tripistic?"}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === "travel"
                ? "Real tours come from operators on Tripistic. If nothing matches your dates or city, you will be told so rather than shown something invented."
                : "Answers come from Tripistic's own documentation. Anything not covered there will be flagged as such."}
            </p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS[mode].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-accent"
                >
                  {prompt}
                </button>
              ))}
            </div>
            {!restored ? <span className="sr-only">Restoring your previous conversation</span> : null}
          </div>
        }
      />

      <ChatComposer
        onSend={send}
        onStop={() => abortRef.current?.abort()}
        busy={busy}
        placeholder={
          mode === "travel" ? "Tell me about your trip…" : "Ask about tours, payments, or pricing…"
        }
      />
    </div>
  );
}
