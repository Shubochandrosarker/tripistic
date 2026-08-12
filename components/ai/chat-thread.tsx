"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, BookOpen, Check, Sparkles, Wrench, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The message list.
 *
 * Presentational and shared between the Copilot and the public advisor. It
 * renders text as text — never `dangerouslySetInnerHTML`. Model output is
 * already checked for markup server-side (`validateModelOutput`), but the
 * renderer not being able to execute HTML is what makes that a second line of
 * defence rather than the only one.
 */

export type ChatCitation = { ref: number; title: string; documentId: string };

export type ChatToolActivity = {
  name: string;
  risk: string;
  ok: boolean;
  proposal?: unknown;
  error?: string;
};

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  tools?: ChatToolActivity[];
  /** Set while the assistant turn is still streaming. */
  pending?: boolean;
};

const RISK_LABEL: Record<string, string> = {
  auto: "Looked up",
  confirm: "Needs your approval",
  strong_confirm: "Do this yourself in the dashboard",
};

function ToolRow({ activity }: { activity: ChatToolActivity }) {
  const Icon = activity.ok ? (activity.risk === "auto" ? Wrench : Check) : X;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs",
        activity.ok
          ? "border-border bg-muted/60 text-muted-foreground"
          : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
      )}
    >
      <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">
        <span className="font-medium text-foreground">{activity.name}</span>
        <span className="ml-1.5">{activity.error ?? RISK_LABEL[activity.risk] ?? "Ran"}</span>
      </span>
    </div>
  );
}

function Citations({ citations }: { citations: ChatCitation[] }) {
  if (citations.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <BookOpen aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="sr-only">Sources</span>
      {citations.map((citation) => (
        <span
          key={`${citation.documentId}-${citation.ref}`}
          className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          title={citation.title}
        >
          [{citation.ref}] {citation.title}
        </span>
      ))}
    </div>
  );
}

export function ChatThread({
  messages,
  emptyState,
  error,
}: {
  messages: ChatMessageView[];
  emptyState?: React.ReactNode;
  error?: string | null;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // `block: "nearest"` rather than a smooth scroll to the very bottom: a user
    // who has scrolled up to re-read something should not be yanked back down
    // by every token that arrives.
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  if (messages.length === 0 && emptyState) {
    return <div className="flex-1 overflow-y-auto px-4 py-6">{emptyState}</div>;
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6" aria-live="polite" aria-busy={messages.at(-1)?.pending}>
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}
        >
          {message.role === "assistant" ? (
            <div
              aria-hidden
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"
            >
              <Sparkles className="h-4 w-4" />
            </div>
          ) : null}

          <div className={cn("min-w-0 max-w-[46rem]", message.role === "user" && "flex flex-col items-end")}>
            {message.tools && message.tools.length > 0 ? (
              <div className="mb-2 space-y-1">
                {message.tools.map((activity, index) => (
                  <ToolRow key={`${activity.name}-${index}`} activity={activity} />
                ))}
              </div>
            ) : null}

            {message.content ? (
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-foreground",
                )}
              >
                {message.content}
              </div>
            ) : message.pending ? (
              <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-4 py-3">
                <span className="sr-only">The assistant is thinking</span>
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
                    style={{ animationDelay: `${dot * 150}ms` }}
                  />
                ))}
              </div>
            ) : null}

            {message.role === "assistant" && message.citations ? (
              <Citations citations={message.citations} />
            ) : null}
          </div>
        </div>
      ))}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}
