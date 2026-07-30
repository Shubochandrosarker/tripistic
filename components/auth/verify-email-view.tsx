"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

type State = "idle" | "verifying" | "verified" | "invalid";

export function VerifyEmailView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<State>(token ? "verifying" : "idle");
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    // POST rather than verifying on GET. A link in an email is fetched by mail
    // scanners and link previewers before a human ever clicks it, and these
    // tokens are single use — verifying on GET would let a scanner consume the
    // link and leave the real user with a dead one.
    void fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (cancelled) return;
        setState(res.ok ? "verified" : "invalid");
      })
      .catch(() => {
        if (!cancelled) setState("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function resend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(form.get("email") ?? "") }),
    }).catch(() => undefined);
    setBusy(false);
    setResent(true);
  }

  if (state === "verifying") {
    return <p className="text-sm text-muted-foreground">Confirming your email address…</p>;
  }

  if (state === "verified") {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-foreground">Email confirmed</p>
        <p className="text-muted-foreground">Your account is ready to use.</p>
        <Link href="/dashboard">
          <Button className="w-full">Go to dashboard</Button>
        </Link>
      </div>
    );
  }

  if (resent) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-foreground">Check your email</p>
        <p className="text-muted-foreground">
          If that address still needs verifying, a new link is on its way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={resend} className="space-y-4">
      {state === "invalid" ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          That verification link is no longer valid. Request a new one below.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Enter your email address and we will send a fresh confirmation link.
        </p>
      )}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Sending…" : "Send a new link"}
      </Button>
    </form>
  );
}
