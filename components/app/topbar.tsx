"use client";

import { Compass, Menu } from "lucide-react";
import { UserMenu } from "@/components/app/user-menu";
import type { AppShellUser } from "@/components/app/app-shell";

export function Topbar({
  user,
  variant,
  onOpenMobileNav,
}: {
  user: AppShellUser;
  variant: "dashboard" | "admin";
  onOpenMobileNav: () => void;
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
