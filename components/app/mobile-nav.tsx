"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

export function MobileNav({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          aria-label="Close navigation"
        >
          <X className="size-5" aria-hidden />
        </button>
        {children}
      </aside>
    </div>
  );
}
