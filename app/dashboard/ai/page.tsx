import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { hasFeature } from "@/lib/plans/entitlements";
import { listWorkspaceConversations } from "@/lib/ai/chat";
import { usageSnapshot } from "@/lib/ai/usage";
import { isChatAvailable } from "@/lib/ai/providers";
import { CopilotWorkspace } from "@/components/ai/copilot-workspace";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Copilot",
  description: "Ask Tripistic about your tours, bookings, customers and website.",
};

export default async function CopilotPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const workspaceId = active.workspace.id;

  // The plan gate is re-checked in the API route on every turn. Checking it
  // here as well is not redundant: it is the difference between a clear upgrade
  // prompt and a chat box that 402s on the first message.
  if (!(await hasFeature(workspaceId, "ai_copilot"))) {
    return (
      <>
        <PageHeader
          title="Copilot"
          description="An assistant that reads your workspace and drafts changes for you to review."
        />
        <EmptyState
          icon={Sparkles}
          title="The Copilot is not included in your current plan"
          description="Upgrade to ask questions about your bookings, tours and customers in plain language, and to have the assistant draft tour copy and website sections for you."
          actions={<ButtonLink href="/dashboard/billing">See plans</ButtonLink>}
        />
      </>
    );
  }

  if (!isChatAvailable()) {
    return (
      <>
        <PageHeader title="Copilot" description="Assistant for your workspace." />
        <EmptyState
          icon={Sparkles}
          title="The assistant is not configured on this deployment"
          description="No AI model provider is available. An administrator needs to configure a provider key before the Copilot can answer."
        />
      </>
    );
  }

  const [conversations, usage] = await Promise.all([
    listWorkspaceConversations(workspaceId, user.id),
    usageSnapshot(workspaceId),
  ]);

  return (
    <>
      <PageHeader
        title="Copilot"
        description="Grounded in your workspace. It can read and draft — publishing, refunds and cancellations stay with you."
      />
      <CopilotWorkspace
        workspaceId={workspaceId}
        initialThreads={conversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          updatedAt: conversation.updatedAt.toISOString(),
        }))}
        initialUsage={{ used: usage.used, limit: usage.limit, warning: usage.warning }}
      />
    </>
  );
}
