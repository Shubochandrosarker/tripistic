"use client";

import { useRef, type FormEvent, type KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The message input.
 *
 * A textarea rather than an input, because "plan three days in Rome with two
 * children and a grandparent who cannot walk far" is a normal thing to type and
 * a single-line field makes it unreadable while typing. Enter sends,
 * Shift+Enter breaks the line — the convention every chat surface uses, and
 * getting it backwards is the fastest way to make a chat feel broken.
 */
export function ChatComposer({
  onSend,
  onStop,
  busy,
  disabled,
  placeholder = "Ask anything…",
  maxLength = 4_000,
}: {
  onSend: (message: string) => void;
  onStop?: () => void;
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const value = ref.current?.value.trim() ?? "";
    if (!value || busy || disabled) return;
    onSend(value);
    if (ref.current) {
      ref.current.value = "";
      ref.current.style.height = "auto";
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function autoGrow() {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    // Capped so a pasted essay cannot push the send button off screen.
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border bg-card/80 px-4 py-3 backdrop-blur"
    >
      <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-accent">
        <label className="sr-only" htmlFor="chat-composer">
          Message
        </label>
        <textarea
          id="chat-composer"
          ref={ref}
          rows={1}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          onInput={autoGrow}
          className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        {busy && onStop ? (
          <Button type="button" variant="secondary" size="sm" onClick={onStop}>
            <Square aria-hidden className="h-3.5 w-3.5" />
            Stop
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={busy || disabled}>
            <Send aria-hidden className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only">Send</span>
          </Button>
        )}
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
        Enter to send, Shift+Enter for a new line. The assistant can be wrong — check anything that matters.
      </p>
    </form>
  );
}
