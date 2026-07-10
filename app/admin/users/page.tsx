import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Users · Admin",
};

export default async function AdminUsersPage() {
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
        description="All registered accounts. Search and management actions arrive in later phases."
      />
      <TableShell
        headers={["User", "Workspaces", "Status", "Last login", "Joined"]}
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
          </tr>
        ))}
      </TableShell>
    </>
  );
}
