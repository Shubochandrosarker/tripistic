import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { formatDate, formatDateTime } from "@/lib/utils";
import { requirePlatformAdminPage } from "@/lib/auth/guards";
import { setPlatformAdmin, setUserStatus } from "@/lib/admin/platform-actions";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Users · Admin",
};

/**
 * Suspend or reactivate an account.
 *
 * Both actions refuse the self-targeting case in
 * `lib/admin/platform-actions.ts`; the button is also hidden below, so the
 * guard is the backstop rather than the only defence.
 */
async function toggleUserStatus(formData: FormData) {
  "use server";

  const admin = await requirePlatformAdminPage();
  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "active" && status !== "suspended") return;

  await setUserStatus(userId, status, { actorId: admin.id });
  revalidatePath("/admin/users");
}

/** Grant or revoke platform-admin access. */
async function togglePlatformAdmin(formData: FormData) {
  "use server";

  const admin = await requirePlatformAdminPage();
  const userId = String(formData.get("userId") ?? "");
  const isPlatformAdmin = formData.get("isPlatformAdmin") === "true";

  await setPlatformAdmin(userId, isPlatformAdmin, { actorId: admin.id });
  revalidatePath("/admin/users");
}

export default async function AdminUsersPage() {
  // Needed to hide the controls that would target the signed-in admin. The
  // service refuses those anyway — this only avoids offering a button that
  // cannot work.
  const currentAdmin = await requirePlatformAdminPage();

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    take: 100,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { memberships: true } } },
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="All registered accounts. Suspending locks a user out of every workspace immediately, including any session they already have."
      />
      <TableShell
        headers={["User", "Workspaces", "Status", "Last login", "Joined", "Actions"]}
        isEmpty={users.length === 0}
        emptyMessage="No users yet."
      >
        {users.map((user) => (
          <tr key={user.id}>
            <Td>
              <span className="flex items-center gap-1.5 font-medium">
                {user.name}
                {user.isPlatformAdmin ? (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-400/20"
                    title="Platform admin"
                  >
                    <ShieldCheck className="size-3" aria-hidden />
                    Admin
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-muted-foreground">{user.email}</span>
            </Td>
            <Td className="text-muted-foreground">{user._count.memberships}</Td>
            <Td>
              <StatusBadge status={user.status} />
            </Td>
            <Td className="text-muted-foreground">{formatDateTime(user.lastLoginAt)}</Td>
            <Td className="text-muted-foreground">{formatDate(user.createdAt)}</Td>
            <Td>
              {user.id === currentAdmin.id ? (
                <span className="text-xs text-muted-foreground">You</span>
              ) : (
                <div className="flex gap-2">
                  <form action={toggleUserStatus}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={user.status === "suspended" ? "active" : "suspended"}
                    />
                    <Button type="submit" variant="secondary" className="h-8 px-3 text-xs">
                      {user.status === "suspended" ? "Reactivate" : "Suspend"}
                    </Button>
                  </form>
                  <form action={togglePlatformAdmin}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input
                      type="hidden"
                      name="isPlatformAdmin"
                      value={user.isPlatformAdmin ? "false" : "true"}
                    />
                    <Button type="submit" variant="secondary" className="h-8 px-3 text-xs">
                      {user.isPlatformAdmin ? "Revoke admin" : "Make admin"}
                    </Button>
                  </form>
                </div>
              )}
            </Td>
          </tr>
        ))}
      </TableShell>
    </>
  );
}
