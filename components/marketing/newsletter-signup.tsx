"use client";

import { useState, type FormEvent } from "react";
import { Check, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/events";

/**
 * Newsletter capture. Submits to the marketing subscribe endpoint and degrades
 * to a clear error message rather than failing silently.
 */
export function NewsletterSignup({
  title = "Operational ideas, once a month",
  description = "Direct booking tactics, AI in practice, and operations playbooks. No spam, unsubscribe in one click.",
}: {
  title?: string;
  description?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/marketing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "newsletter" }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        confirmationSent?: boolean;
      };

      if (!response.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : "Subscription failed");
      }

      trackEvent("newsletter_subscribe", { source: "newsletter" });
      // The server reports whether a confirmation actually went out. Telling
      // someone to check an inbox we never mailed is the failure this fixes.
      setConfirmationSent(Boolean(body.confirmationSent));
      setState("done");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="size-4 text-accent" aria-hidden />
          {confirmationSent
            ? "You're subscribed. Check your inbox to confirm."
            : "You're on the list. We'll be in touch."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Mail className="size-4.5 text-accent" aria-hidden />
            {title}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            aria-describedby={state === "error" ? "newsletter-error" : undefined}
            aria-invalid={state === "error" || undefined}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
          <Button type="submit" disabled={state === "submitting"} className="h-10 shrink-0">
            {state === "submitting" ? "Subscribing…" : "Subscribe"}
          </Button>
        </form>
      </div>

      {state === "error" ? (
        <p id="newsletter-error" role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}
