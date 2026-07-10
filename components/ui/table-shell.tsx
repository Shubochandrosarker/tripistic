import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Table shell with horizontal scroll containment and a built-in empty row.
 * Pass `isEmpty` with `emptyMessage` when there are no rows.
 */
export function TableShell({
  headers,
  children,
  isEmpty,
  emptyMessage = "Nothing here yet.",
  className,
}: {
  headers: string[];
  children: ReactNode;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-border bg-card shadow-xs",
        className,
      )}
    >
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isEmpty ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-4 py-10 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle text-foreground", className)}>{children}</td>;
}
