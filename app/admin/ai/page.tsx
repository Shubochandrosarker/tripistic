import type { Metadata } from "next";
import { Brain, Cpu, MessageSquare, TriangleAlert } from "lucide-react";

import { aiCostByWorkspace, aiPlatformMetrics, formatMillicents } from "@/lib/admin/v3-metrics";
import { embeddingBackend } from "@/lib/ai/rag/embeddings";
import { providerStatus } from "@/lib/ai/providers";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = { title: "AI · Admin" };

const SURFACE_LABELS: Record<string, string> = {
  public_advisor: "Public advisor",
  workspace_copilot: "Workspace copilot",
  contextual: "Contextual",
  system: "System",
};

export default async function AdminAiPage() {
  const [metrics, costs, recentFailures, knowledgeSources] = await Promise.all([
    aiPlatformMetrics(),
    aiCostByWorkspace(),
    prisma.aiUsageEvent.findMany({
      where: { success: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        surface: true,
        task: true,
        provider: true,
        model: true,
        errorType: true,
        createdAt: true,
      },
    }),
    prisma.knowledgeSource.groupBy({ by: ["scope", "status"], _count: { _all: true } }),
  ]);

  const providers = providerStatus();

  return (
    <>
      <PageHeader
        title="AI"
        description="Provider health, usage and cost attribution. Costs are estimates from a static price table, never a billing figure."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Cpu}
          label="Requests today"
          value={String(metrics.requestsToday)}
          hint={`${metrics.failuresToday} failed`}
        />
        <MetricCard
          icon={MessageSquare}
          label="Requests this month"
          value={String(metrics.requestsThisMonth)}
          hint={`${(metrics.inputTokensThisMonth + metrics.outputTokensThisMonth).toLocaleString()} tokens`}
        />
        <MetricCard
          icon={Brain}
          label="Estimated cost"
          value={formatMillicents(metrics.estimatedCostMillicentsThisMonth)}
          hint="This calendar month — estimate only"
        />
        <MetricCard
          icon={TriangleAlert}
          label="Knowledge failures"
          value={String(metrics.knowledgeFailures)}
          hint={`${metrics.knowledgeDocuments} documents indexed`}
        />
      </div>

      <SectionCard
        title="Providers"
        description="Whether a key is present, and whether calls route through the Cloudflare AI Gateway. No key material is read or displayed."
      >
        <TableShell headers={["Provider", "Configured", "Via AI Gateway"]} isEmpty={false}>
          {providers.map((provider) => (
            <tr key={provider.provider}>
              <Td className="text-foreground">{provider.provider}</Td>
              <Td>
                <StatusBadge status={provider.configured ? "active" : "disabled"} />
              </Td>
              <Td className="text-muted-foreground">{provider.viaGateway ? "Yes" : "Direct"}</Td>
            </tr>
          ))}
        </TableShell>
        <p className="mt-3 text-xs text-muted-foreground">
          Embedding backend: <strong className="text-foreground">{embeddingBackend()}</strong>.
          {embeddingBackend() === "deterministic"
            ? " This is a hash-based stand-in with no semantic meaning — retrieval relevance is effectively random until Workers AI is configured. Tenant isolation is unaffected: it is enforced by the metadata filter, not by embedding similarity."
            : ""}
        </p>
      </SectionCard>

      <SectionCard
        title="Cost by workspace"
        description="This calendar month, highest first. An estimate for spotting outliers — never an invoice."
      >
        <TableShell
          headers={["Workspace", "Requests", "Input tokens", "Output tokens", "Estimated cost"]}
          isEmpty={costs.length === 0}
          emptyMessage="No AI usage recorded this month."
        >
          {costs.map((row) => (
            <tr key={row.workspaceId}>
              <Td className="text-foreground">{row.name}</Td>
              <Td className="text-muted-foreground">{row.requests}</Td>
              <Td className="text-muted-foreground">{row.inputTokens.toLocaleString()}</Td>
              <Td className="text-muted-foreground">{row.outputTokens.toLocaleString()}</Td>
              <Td className="text-muted-foreground">
                {formatMillicents(row.estimatedCostMillicents)}
              </Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Conversations by surface">
          <TableShell
            headers={["Surface", "Conversations"]}
            isEmpty={metrics.conversationsBySurface.length === 0}
            emptyMessage="No conversations yet."
          >
            {metrics.conversationsBySurface.map((row) => (
              <tr key={row.surface}>
                <Td className="text-foreground">{SURFACE_LABELS[row.surface] ?? row.surface}</Td>
                <Td className="text-muted-foreground">{row.count}</Td>
              </tr>
            ))}
          </TableShell>
        </SectionCard>

        <SectionCard title="Knowledge sources">
          <TableShell
            headers={["Scope", "Status", "Sources"]}
            isEmpty={knowledgeSources.length === 0}
            emptyMessage="No knowledge sources indexed."
          >
            {knowledgeSources.map((row) => (
              <tr key={`${row.scope}-${row.status}`}>
                <Td className="text-foreground">{row.scope}</Td>
                <Td>
                  <StatusBadge status={row.status} />
                </Td>
                <Td className="text-muted-foreground">{row._count._all}</Td>
              </tr>
            ))}
          </TableShell>
        </SectionCard>
      </div>

      <SectionCard
        title="Recent failures"
        description="Failed calls are recorded as well as successful ones — a month where 40% of calls errored is the most useful thing to know about an AI feature."
      >
        <TableShell
          headers={["Surface", "Task", "Provider", "Model", "Error", "When"]}
          isEmpty={recentFailures.length === 0}
          emptyMessage="No failures recorded."
        >
          {recentFailures.map((failure) => (
            <tr key={failure.id}>
              <Td className="text-foreground">
                {SURFACE_LABELS[failure.surface] ?? failure.surface}
              </Td>
              <Td className="text-muted-foreground">{failure.task}</Td>
              <Td className="text-muted-foreground">{failure.provider}</Td>
              <Td className="text-muted-foreground">{failure.model}</Td>
              <Td className="text-muted-foreground">{failure.errorType ?? "—"}</Td>
              <Td className="text-muted-foreground">{formatDateTime(failure.createdAt)}</Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>
    </>
  );
}
