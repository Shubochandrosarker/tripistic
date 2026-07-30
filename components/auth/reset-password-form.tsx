"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    // Checked here as well as on the server: a mismatch is a typo, and making
    // the user wait for a round trip to find out is just worse.
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setBusy(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "This reset link is no longer valid. Request a new one.");
      return;
    }
    setDone(true);
  }

  if (!token) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">This reset link is incomplete.</p>
        <Link href="/forgot-password" className="font-medium text-accent hover:underline">
          Request a new one
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-foreground">Password updated</p>
        <p className="text-muted-foreground">
          You have been signed out on every other device. Sign in with your new password.
        </p>
        <Button className="w-full" onClick={() => router.push("/login")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="New password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          placeholder="At least 8 characters"
          required
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
