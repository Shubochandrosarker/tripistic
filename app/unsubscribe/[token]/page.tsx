import type { Metadata } from "next";
import Link from "next/link";
import { Compass, MailX, CheckCircle2 } from "lucide-react";
import { applyUnsubscribeToken } from "@/lib/messaging/service";

type Params = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Compass className="size-5" aria-hidden />
        </span>
        <span className="text-lg font-semibold tracking-tight text-foreground">Tripistic</span>
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-xs">
        {children}
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <Frame>
      <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <MailX className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-base font-semibold text-foreground">Invalid link</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">This unsubscribe link isn&apos;t valid.</p>
    </Frame>
  );
}

/**
 * Deliberately acts on GET, not behind a confirm-then-POST step (contrast
 * `/invite/[token]`, which requires an explicit accept click) — one-click,
 * no-confirmation unsubscribe is the CAN-SPAM/GDPR-recommended pattern;
 * adding friction here is considered a dark pattern. The action is
 * idempotent (safe if an email-security scanner prefetches the link, or a
 * guest opens it twice), which is the standard mitigation every ESP relies
 * on for this same GET-based approach.
 */
export default async function UnsubscribePage({ params }: Params) {
  const { token } = await params;
  const result = await applyUnsubscribeToken(token);
  if (result.status === "invalid") return <InvalidLink />;
  const { customer } = result;

  return (
    <Frame>
      <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <CheckCircle2 className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-base font-semibold text-foreground">You&apos;re unsubscribed</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {customer.email} won&apos;t receive emails like this one again. You&apos;ll still receive booking
        confirmations and departure reminders for any tour you book.
      </p>
    </Frame>
  );
}
