import Link from "next/link";
import { Compass } from "lucide-react";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Compass className="size-5" aria-hidden />
        </span>
        <span className="text-lg font-semibold tracking-tight text-foreground">Tripistic</span>
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xs">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>
    </div>
  );
}
