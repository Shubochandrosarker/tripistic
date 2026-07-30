import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { AppShell } from "@/components/app/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUserPage();

  // Verification is enforced from here forward, not retroactively: the Phase 7
  // migration backfilled `emailVerifiedAt` for every account that already
  // existed, so shipping this locks nobody out. Sign-in itself still succeeds —
  // the user needs a session to reach the resend form.
  if (!user.emailVerifiedAt) {
    redirect("/verify-email");
  }

  const active = await getActiveWorkspace(user.id);

  if (!active) {
    redirect("/workspaces/new");
  }

  return (
    <AppShell
      variant="dashboard"
      user={{
        name: user.name,
        email: user.email,
        isPlatformAdmin: user.isPlatformAdmin,
      }}
      workspaces={active.memberships.map((membership) => ({
        id: membership.workspaceId,
        name: membership.workspace.name,
        role: membership.role,
      }))}
      activeWorkspaceId={active.workspace.id}
    >
      {children}
    </AppShell>
  );
}
