"use client";

import { Command, Compass, Menu, Search } from "lucide-react";
import { UserMenu } from "@/components/app/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { AppShellUser } from "@/components/app/app-shell";

export function Topbar({
  user,
  variant,
  onOpenMobileNav,
  onOpenCommandPalette,
}: {
  user: AppShellUser;
  variant: "dashboard" | "admin";
  onOpenMobileNav: () => void;
  onOpenCommandPalette: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:pl-64">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      <div className="flex items-center gap-2 md:hidden">
        <span className="flex size-6 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Compass className="size-3.5" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-foreground">Tripistic</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="hidden h-8 min-w-64 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
        >
          <Search className="size-3.5" aria-hidden />
          <span className="flex-1">Search or ask Tripistic AI</span>
          <span className="inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">
            <Command className="size-3" aria-hidden /> K
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          aria-label="Open command palette"
        >
          <Search className="size-5" aria-hidden />
        </button>
        <ThemeToggle />
        <UserMenu
          name={user.name}
          email={user.email}
          isPlatformAdmin={user.isPlatformAdmin}
          variant={variant}
        />
      </div>
    </header>
  );
}
