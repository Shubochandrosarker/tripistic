import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  actions,
  children,
  footer,
  className,
  id,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn("rounded-xl border border-border bg-card shadow-xs", className)}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            {title ? <h2 className="text-sm font-semibold text-foreground">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
      {footer ? (
        <footer className="border-t border-border bg-muted/50 px-5 py-3 text-sm text-muted-foreground rounded-b-xl">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
