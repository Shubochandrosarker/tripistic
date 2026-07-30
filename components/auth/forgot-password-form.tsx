"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/**
 * The success state is shown for every submission that reaches the server,
 * including addresses with no account. The endpoint deliberately answers the
 * same way in all cases — showing anything different here would put the
 * account-enumeration oracle back that the API is careful to avoid.
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(form.get("email") ?? "") }),
    });

    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Something went wrong. Try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-foreground">Check your email</p>
        <p className="text-muted-foreground">
          If an account exists for that address, a reset link is on its way. The link expires in an
          hour and can only be used once.
        </p>
        <p className="text-muted-foreground">
          Nothing arrived? Check spam, then try again in a few minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@business.com"
          required
        />
      </Field>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
