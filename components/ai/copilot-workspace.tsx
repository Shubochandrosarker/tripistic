"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquarePlus, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/components/ai/chat-composer";
import { ChatThread, type ChatMessageView } from "@/components/ai/chat-thread";
import { streamChat, type StreamEvent } from "@/lib/ai/stream-client";
import { cn } from "@/lib/utils";

/**
 * The workspace Copilot.
 *
 * Thread list on the left, transcript on the right. State is kept locally and
 * the server is the record: a turn appends optimistically so typing feels
 * instant, and the `done` event reconciles the thread id and title that the
 * server actually assigned. Nothing is invented client-side that the server did
 * not confirm — in particular the conversation id, which is what every
 * subsequent turn is addressed to.
 */

type Thread = { id: string; title: string | null; updatedAt: string };

type Usage = { used: number; limit: number | null; warning: boolean };

export type CopilotSuggestion = { label: string; prompt: string };

const SUGGESTIONS: CopilotSuggestion[] = [
  { label: "What needs configuring?", prompt: "What still needs configuring in my workspace?" },
  { label: "How are bookings doing?", prompt: "How have my bookings looked over the last 30 days?" },
  { label: "Improve a tour", prompt: "Which of my tours has the weakest description, and how would you improve it?" },
  { label: "Explain my plan", prompt: "What does my current plan include, and how much AI usage have I used?" },
];

let localId = 0;
function nextLocalId(prefix: string) {
  localId += 1;
  return `${prefix}-${localId}`;
}

export function CopilotWorkspace({
  workspaceId,
  route,
  initialThreads,
  initialUsage,
}: {
  workspaceId: string;
  route?: string;
  initialThreads: Thread[];
  initialUsage: Usage;
}) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage>(initialUsage);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight turn when the component unmounts. Without it a
  // navigation mid-answer leaves the fetch running and the state setters below
  // firing against an unmounted tree.
  useEffect(() => () => abortRef.current?.abort(), []);

  const openThread = useCallback(
    async (conversationId: string) => {
      abortRef.current?.abort();
      setActiveId(conversationId);
      setError(null);
      setMessages([]);
      const response = await fetch(
        `/api/workspaces/${workspaceId}/ai/conversations/${conversationId}`,
      );
      if (!response.ok) {
        setError("That conversation could not be loaded.");
        return;
      }
      const payload = (await response.json()) as {
        messages: Array<{
          id: string;
          role: string;
          content: string;
          citations?: ChatMessageView["citations"];
          toolCalls?: ChatMessageView["tools"];
        }>;
      };
      setMessages(
        payload.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({
            id: message.id,
            role: message.role as "user" | "assistant",
            content: message.content,
            citations: message.citations ?? [],
            tools: message.toolCalls ?? [],
          })),
      );
    },
    [workspaceId],
  );

  function startNewThread() {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setError(null);
  }

  async function archiveThread(conversationId: string) {
    const response = await fetch(
      `/api/workspaces/${workspaceId}/ai/conversations/${conversationId}`,
      { method: "DELETE" },
    );
    if (!response.ok) return;
    setThreads((current) => current.filter((thread) => thread.id !== conversationId));
    if (activeId === conversationId) startNewThread();
  }

  const send = useCallback(
    async (text: string) => {
      const controller = new AbortController();
      abortRef.current = controller;

      const assistantId = nextLocalId("assistant");
      setError(null);
      setBusy(true);
      setMessages((current) => [
        ...current,
        { id: nextLocalId("user"), role: "user", content: text },
        { id: assistantId, role: "assistant", content: "", pending: true, tools: [], citations: [] },
      ]);

      const patch = (update: (message: ChatMessageView) => ChatMessageView) => {
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? update(message) : message)),
        );
      };

      const handle = (event: StreamEvent) => {
        if (event.type === "delta") {
          patch((message) => ({ ...message, content: message.content + event.text }));
        } else if (event.type === "tool") {
          patch((message) => ({ ...message, tools: [...(message.tools ?? []), event.activity] }));
        } else if (event.type === "citations") {
          patch((message) => ({ ...message, citations: event.citations }));
        } else if (event.type === "error") {
          setError(event.message);
          patch((message) => ({ ...message, pending: false }));
        } else if (event.type === "done") {
          patch((message) => ({ ...message, id: event.messageId, pending: false }));
          setActiveId(event.conversationId);
          setThreads((current) => {
            const existing = current.find((thread) => thread.id === event.conversationId);
            const entry: Thread = {
              id: event.conversationId,
              title: event.title,
              updatedAt: new Date().toISOString(),
            };
            return existing
              ? [entry, ...current.filter((thread) => thread.id !== event.conversationId)]
              : [entry, ...current];
          });
          // A turn always costs at least one credit; reflecting it immediately
          // keeps the meter honest without another round trip.
          setUsage((current) =>
            current.limit === null ? current : { ...current, used: current.used + 1 },
          );
        }
      };

      try {
        await streamChat(
          `/api/workspaces/${workspaceId}/ai/chat`,
          { message: text, conversationId: activeId ?? undefined, route },
          { onEvent: handle, signal: controller.signal },
        );
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
    [activeId, route, workspaceId],
  );

  const overLimit = usage.limit !== null && usage.used >= usage.limit;

  return (
    <div className="grid min-h-[calc(100vh-13rem)] gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="hidden flex-col rounded-xl border border-border bg-card lg:flex">
        <div className="border-b border-border p-3">
          <Button variant="secondary" className="w-full" onClick={startNewThread}>
            <MessageSquarePlus aria-hidden className="h-4 w-4" />
            New conversation
          </Button>
        </div>
        <nav aria-label="Conversations" className="flex-1 overflow-y-auto p-2">
          {threads.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No conversations yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {threads.map((thread) => (
                <li key={thread.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openThread(thread.id)}
                    aria-current={activeId === thread.id ? "true" : undefined}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm",
                      activeId === thread.id
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {thread.title ?? "Untitled"}
                  </button>
                  <button
                    type="button"
                    onClick={() => archiveThread(thread.id)}
                    aria-label={`Archive ${thread.title ?? "conversation"}`}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
        {usage.limit !== null ? (
          <div className="border-t border-border p-3 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>AI credits</span>
              <span className={cn(usage.warning && "font-medium text-foreground")}>
                {usage.used} / {usage.limit}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", usage.warning ? "bg-amber-500" : "bg-accent")}
                style={{ width: `${Math.min(100, (usage.used / Math.max(usage.limit, 1)) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </aside>

      <div className="flex min-h-[32rem] flex-col overflow-hidden rounded-xl border border-border bg-background">
        <ChatThread
          messages={messages}
          error={error}
          emptyState={
            <div className="mx-auto max-w-lg text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Sparkles aria-hidden className="h-5 w-5" />
              </div>
              <h2 className="mt-3 text-base font-semibold text-foreground">
                Ask the Copilot about your business
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                It reads your tours, bookings, website and plan through the same permission checks
                you have. It drafts changes for you to review — it never applies them itself.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => send(suggestion.prompt)}
                    disabled={overLimit}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-accent disabled:opacity-50"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          }
        />
        {overLimit ? (
          <div className="border-t border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            This workspace has used its monthly AI credits. They reset at the start of next month,
            or you can upgrade for a larger allowance.
          </div>
        ) : (
          <ChatComposer
            onSend={send}
            onStop={() => abortRef.current?.abort()}
            busy={busy}
            placeholder="Ask about bookings, tours, customers or your website…"
            maxLength={8_000}
          />
        )}
      </div>
    </div>
  );
}
