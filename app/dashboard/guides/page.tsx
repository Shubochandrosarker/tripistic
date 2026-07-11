import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageGuides, canViewGuides } from "@/lib/auth/permissions";
import { listGuides } from "@/lib/guides/service";
import type { WorkspaceRoleValue } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { GuidesPanel } from "@/components/guides/guides-panel";

export const metadata: Metadata = {
  title: "Guides",
};

export default async function GuidesPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewGuides(active.role)) notFound();

  const members = await listGuides(active.workspace.id);

  return (
    <>
      <PageHeader
        title="Guides"
        description="Certifications and notes for anyone who can be assigned to lead a departure. Assign a guide to a specific departure from that tour's page."
      />

      <SectionCard title="Team roster">
        <GuidesPanel
          workspaceId={active.workspace.id}
          canManage={canManageGuides(active.role)}
          guides={members.map((member) => ({
            id: member.id,
            name: member.user.name,
            email: member.user.email,
            role: member.role as WorkspaceRoleValue,
            certifications: member.guideProfile?.certifications ?? [],
            notes: member.guideProfile?.notes ?? null,
          }))}
        />
      </SectionCard>
    </>
  );
}
