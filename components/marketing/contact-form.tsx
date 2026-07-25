"use client";

import { useState, type FormEvent } from "react";
import { Check, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { trackConversion } from "@/lib/analytics/events";

const REASONS = ["Sales", "Support", "Partnership", "Media", "General Inquiry"] as const;

export function ContactForm() {
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      company: String(form.get("company") ?? ""),
      reason: String(form.get("reason") ?? "General Inquiry"),
      message: String(form.get("message") ?? ""),
      website: String(form.get("website") ?? ""),
    };

    try {
      const response = await fetch("/api/marketing/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body?.error === "string" ? body.error : "Could not send your message");
      }

      trackConversion("contact_submit");
      setState("done");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Check className="size-5 text-accent" aria-hidden />
          Message sent
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Thanks — we have your enquiry. Sales and partnership requests are answered within one
          business day; support requests follow the response targets in our Service Level Agreement.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" required autoComplete="name" placeholder="Your name" />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Company" htmlFor="company" hint="Optional">
          <Input id="company" name="company" autoComplete="organization" placeholder="Company name" />
        </Field>
        <Field label="Reason for contact" htmlFor="reason">
          <Select id="reason" name="reason" defaultValue="Sales">
            {REASONS.map((reason) => (
              <option key={reason}>{reason}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Message" htmlFor="message" hint="What are you trying to solve?">
          <textarea
            id="message"
            name="message"
            required
            minLength={10}
            rows={6}
            placeholder="Tell us about your operation — tour types, volume, team size, and what is costing you time."
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        </Field>
      </div>

      {/* Honeypot — hidden from users and assistive technology, attractive to bots. */}
      <div className="hidden" aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state === "error" ? (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={state === "submitting"}>
          <Send className="size-4" aria-hidden />
          {state === "submitting" ? "Sending…" : "Send message"}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          We use your details only to answer this enquiry. See our privacy policy.
        </p>
      </div>
    </form>
  );
}
