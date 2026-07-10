import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Audit logs · Admin",
};

function metadataPreview(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "—";
  try {
    const text = JSON.stringify(metadata);
    return text.length > 80 ? `${text.slice(0, 77)}…` : text;
  } catch {
    return "—";
  }
}

export default async function AdminAuditLogsPage() {
  const logs = await prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { email: true } },
      workspace: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Append-only record of sensitive actions across the platform. Filtering and export arrive in later phases."
      />
      <TableShell
        headers={["Action", "User", "Workspace", "Entity", "Metadata", "IP", "When"]}
        isEmpty={logs.length === 0}
        emptyMessage="No audit events yet — they appear as users register, log in, and manage workspaces."
      >
        {logs.map((log) => (
          <tr key={log.id}>
            <Td className="font-medium">{log.action.replace(/_/g, " ")}</Td>
            <Td className="text-muted-foreground">{log.user?.email ?? "system"}</Td>
            <Td className="text-muted-foreground">{log.workspace?.name ?? "—"}</Td>
            <Td className="text-muted-foreground">
              {log.entityType ? `${log.entityType}${log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ""}` : "—"}
            </Td>
            <Td className="max-w-56 truncate font-mono text-xs text-muted-foreground">
              {metadataPreview(log.metadata)}
            </Td>
            <Td className="text-muted-foreground">{log.ipAddress ?? "—"}</Td>
            <Td className="text-muted-foreground">{formatDateTime(log.createdAt)}</Td>
          </tr>
        ))}
      </TableShell>
    </>
  );
}
