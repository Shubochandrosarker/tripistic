"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Compass, ShieldCheck } from "lucide-react";
import { CommandPalette } from "@/components/app/command-palette";
import { adminNav, dashboardNav } from "@/components/app/nav-items";
import { MobileNav } from "@/components/app/mobile-nav";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { Topbar } from "@/components/app/topbar";
import {
  WorkspaceSwitcher,
  type WorkspaceOption,
} from "@/components/app/workspace-switcher";

export type AppShellUser = {
  name: string;
  email: string;
  isPlatformAdmin: boolean;
};

/**
 * Application shell: desktop sidebar, topbar, and mobile drawer navigation.
 * `variant` switches between the operator dashboard and the platform admin area.
 */
export function AppShell({
  variant,
  user,
  workspaces,
  activeWorkspaceId,
  children,
}: {
  variant: "dashboard" | "admin";
  user: AppShellUser;
  workspaces?: WorkspaceOption[];
  activeWorkspaceId?: string;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const sections = variant === "admin" ? adminNav : dashboardNav;

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Link
          href={variant === "admin" ? "/admin" : "/dashboard"}
          className="flex items-center gap-2"
          onClick={() => setMobileOpen(false)}
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Compass className="size-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">Tripistic</span>
        </Link>
        {variant === "admin" ? (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-400/20">
            <ShieldCheck className="size-3" aria-hidden />
            Admin
          </span>
        ) : null}
      </div>

      {variant === "dashboard" && workspaces && workspaces.length > 0 && activeWorkspaceId ? (
        <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
      ) : null}

      <SidebarNav sections={sections} onNavigate={() => setMobileOpen(false)} />

      <div className="border-t border-border p-3">
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground/70">
          {variant === "admin"
            ? "Platform administration — actions here are audited."
            : "Bookings, payments, guides, waivers, operations, and business insights are live."}
        </p>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card md:flex">
        {sidebarContent}
      </aside>

      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)}>
        {sidebarContent}
      </MobileNav>

      <Topbar
        user={user}
        variant={variant}
        onOpenMobileNav={() => setMobileOpen(true)}
        onOpenCommandPalette={() => setCommandOpen(true)}
      />
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        sections={sections}
        activeWorkspaceId={variant === "dashboard" ? activeWorkspaceId : undefined}
      />

      <main className="px-4 py-6 md:pl-64">
        <div className="mx-auto w-full max-w-6xl space-y-6 md:px-6">{children}</div>
      </main>
    </div>
  );
}
