"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

/**
 * Chooses which verified domain serves this site.
 *
 * Adding a hostname is a separate, slower lifecycle that lives on the Domains
 * page — DNS propagation and certificate issuance take time. This screen only
 * makes the instant decision: of the hostnames this workspace has already
 * verified, which one points here.
 *
 * Unverified domains are listed but not selectable. Hiding them would make the
 * page look empty to someone who just added one and is waiting; showing them
 * greyed out with their real status answers "did my domain register?" without
 * a trip to another page.
 */

export type BindableDomain = {
  id: string;
  hostname: string;
  status: string;
  boundToThisSite: boolean;
};

export function SiteDomainBinder({
  workspaceId,
  siteId,
  subdomain,
  domains,
  canManage,
}: {
  workspaceId: string;
  siteId: string;
  subdomain: string;
  domains: BindableDomain[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function bind(domainId: string | null) {
    setBusy(domainId ?? "unbind");
    setError(null);
    try {
      const url = `/api/workspaces/${workspaceId}/sites/${siteId}/domain`;
      const response = await fetch(url, {
        method: domainId ? "POST" : "DELETE",
        headers: domainId ? { "Content-Type": "application/json" } : undefined,
        body: domainId ? JSON.stringify({ domainId }) : undefined,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not update the domain.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  const bound = domains.find((domain) => domain.boundToThisSite);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <p className="text-sm text-foreground">
          Always available: <code className="text-accent">{subdomain}.tripistic.site</code>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The Tripistic address keeps working even when a custom domain is attached, so a DNS
          problem never takes the site offline.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {domains.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No custom domains yet.{" "}
          <Link href="/dashboard/domains" className="text-accent hover:underline">
            Add one on the Domains page
          </Link>
          , then come back to point it at this website.
        </p>
      ) : (
        <ul className="space-y-2">
          {domains.map((domain) => {
            const usable = domain.status === "active";
            return (
              <li
                key={domain.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {domain.hostname}
                  </span>
                  <span className="mt-0.5 block">
                    <StatusBadge status={domain.status} />
                  </span>
                </span>
                {domain.boundToThisSite ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canManage || busy !== null}
                    onClick={() => bind(null)}
                  >
                    {busy === "unbind" ? "Removing…" : "Stop serving this site"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={!canManage || !usable || busy !== null}
                    title={usable ? undefined : "This domain is not verified and active yet."}
                    onClick={() => bind(domain.id)}
                  >
                    {busy === domain.id ? "Pointing…" : "Point at this site"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {bound ? (
        <p className="text-xs text-muted-foreground">
          Publish after changing the domain so the new hostname is baked into the deployment.
        </p>
      ) : null}
    </div>
  );
}
