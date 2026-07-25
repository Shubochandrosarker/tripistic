import type { Metadata } from "next";
import { Bot, Cpu, KeyRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "AI Providers · Admin",
};

export default async function AdminAiProvidersPage() {
  const providers = await prisma.aiProviderConfig.findMany({
    orderBy: [{ isDefault: "desc" }, { provider: "asc" }],
  });

  const envProviders = [
    { name: "OpenAI", ready: Boolean(process.env.OPENAI_API_KEY), key: "OPENAI_API_KEY" },
    { name: "OpenRouter", ready: Boolean(process.env.OPENROUTER_API_KEY), key: "OPENROUTER_API_KEY" },
    { name: "AI Gateway", ready: Boolean(process.env.AI_GATEWAY_URL), key: "AI_GATEWAY_URL" },
  ];

  return (
    <>
      <PageHeader
        title="AI Providers"
        description="Provider registry for command palette intelligence, itinerary generation, and analytics copilots."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={Cpu} label="Configured providers" value={String(providers.length)} hint="Database provider registry" />
        <MetricCard icon={Bot} label="Active providers" value={String(providers.filter((item) => item.status === "active").length)} hint="Available to AI workflows" />
        <MetricCard icon={KeyRound} label="Env readiness" value={`${envProviders.filter((item) => item.ready).length}/3`} hint="Configured provider env vars" />
      </div>

      <SectionCard title="Environment Readiness">
        <div className="grid gap-3 md:grid-cols-3">
          {envProviders.map((provider) => (
            <div key={provider.key} className="rounded-lg border border-border bg-muted/35 p-3">
              <p className="text-sm font-medium text-foreground">{provider.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{provider.key}</p>
              <div className="mt-3">
                <StatusBadge status={provider.ready ? "ready" : "missing"} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <TableShell
        headers={["Provider", "Model", "Status", "Default", "Base URL", "Updated"]}
        isEmpty={providers.length === 0}
        emptyMessage="No AI providers have been registered yet."
      >
        {providers.map((provider) => (
          <tr key={provider.id}>
            <Td>
              <span className="font-medium">{provider.displayName}</span>
              <span className="block text-xs text-muted-foreground">{provider.provider}</span>
            </Td>
            <Td className="text-muted-foreground">{provider.defaultModel ?? "Not set"}</Td>
            <Td>
              <StatusBadge status={provider.status} />
            </Td>
            <Td className="text-muted-foreground">{provider.isDefault ? "Yes" : "No"}</Td>
            <Td className="max-w-xs truncate text-muted-foreground">{provider.baseUrl ?? "Default SDK endpoint"}</Td>
            <Td className="text-muted-foreground">{formatDateTime(provider.updatedAt)}</Td>
          </tr>
        ))}
      </TableShell>
    </>
  );
}
