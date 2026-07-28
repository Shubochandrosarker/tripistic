"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

type DomainRow = {
  id: string;
  hostname: string;
  status: string;
  verificationToken: string;
  expectedCname: string;
  provider: string;
  providerStatus: string | null;
  providerSslStatus: string | null;
  providerTxtName: string | null;
  providerTxtValue: string | null;
  providerHttpUrl: string | null;
  providerHttpBody: string | null;
  redirectTo: string | null;
  lastCheckMessage: string | null;
};

export function DomainManager({
  workspaceId,
  domains,
  canManage,
}: {
  workspaceId: string;
  domains: DomainRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(endpoint: string, method = "POST", body?: unknown) {
    setBusy(endpoint);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Domain request failed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Domain request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function addDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await call(`/api/workspaces/${workspaceId}/domains`, "POST", {
      hostname: String(form.get("hostname") ?? ""),
      redirectToWww: form.get("redirectToWww") === "on",
    });
    event.currentTarget.reset();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addDomain} className="grid gap-3 md:grid-cols-[1fr_auto]">
        <Field label="Hostname" htmlFor="domain-hostname" hint="Use www.example.com, or example.com with redirect to www enabled.">
          <Input id="domain-hostname" name="hostname" placeholder="www.example.com" disabled={!canManage || busy !== null} required />
        </Field>
        <div className="flex items-end gap-3">
          <label className="mb-2 flex items-center gap-2 whitespace-nowrap text-sm text-foreground">
            <input type="checkbox" name="redirectToWww" className="size-4 rounded border-border accent-[var(--accent)]" disabled={!canManage || busy !== null} />
            Redirect to www
          </label>
          <Button type="submit" disabled={!canManage || busy !== null}>
            <Plus className="size-4" aria-hidden />
            Add domain
          </Button>
        </div>
      </form>

      {domains.length === 0 ? (
        <p className="text-sm text-muted-foreground">No custom domains configured yet.</p>
      ) : (
        <div className="space-y-4">
          {domains.map((domain) => (
            <div key={domain.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">{domain.hostname}</h3>
                  <p className="text-sm text-muted-foreground">{domain.lastCheckMessage ?? "Awaiting first DNS check."}</p>
                  {domain.redirectTo ? <p className="text-xs text-muted-foreground">Redirects to {domain.redirectTo}</p> : null}
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{domain.status.replace(/_/g, " ")}</span>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">CNAME</p>
                  <p className="font-mono text-xs text-foreground">{domain.hostname}</p>
                  <p className="font-mono text-xs text-muted-foreground">{domain.expectedCname}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">TXT</p>
                  <p className="font-mono text-xs text-foreground">_tripistic.{domain.hostname}</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">{domain.verificationToken}</p>
                </div>
                {domain.providerTxtName && domain.providerTxtValue ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cloudflare TXT</p>
                    <p className="font-mono text-xs text-foreground">{domain.providerTxtName}</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">{domain.providerTxtValue}</p>
                  </div>
                ) : null}
                {domain.providerHttpUrl && domain.providerHttpBody ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cloudflare HTTP</p>
                    <p className="break-all font-mono text-xs text-foreground">{domain.providerHttpUrl}</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">{domain.providerHttpBody}</p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provider</p>
                  <p className="text-xs text-foreground">{domain.provider}</p>
                  <p className="text-xs text-muted-foreground">
                    Host {domain.providerStatus ?? "pending"} / SSL {domain.providerSslStatus ?? "pending"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canManage || busy !== null || domain.status === "disabled"}
                  onClick={() => call(`/api/workspaces/${workspaceId}/domains/${domain.id}/verify`)}
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  Verify DNS
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canManage || busy !== null || !["verified", "ssl_pending"].includes(domain.status)}
                  onClick={() => call(`/api/workspaces/${workspaceId}/domains/${domain.id}/activate`)}
                >
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Mark active
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 dark:text-red-400"
                  disabled={!canManage || busy !== null || domain.status === "disabled"}
                  onClick={() => call(`/api/workspaces/${workspaceId}/domains/${domain.id}`, "DELETE")}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
