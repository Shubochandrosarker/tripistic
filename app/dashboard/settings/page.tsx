import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import {
  canManageMembers,
  canManageWorkspace,
  canModifyMemberWithRole,
  grantableRoles,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { BUSINESS_TYPE_LABELS, type WorkspaceRoleValue } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { RoleBadge } from "@/components/ui/role-badge";
import { WorkspaceSettingsForm } from "@/components/settings/workspace-settings-form";
import { MembersPanel } from "@/components/settings/members-panel";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const role = active.role;
  const showMembers = true;
  const manageMembers = canManageMembers(role);

  const [members, invitations] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: active.workspace.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    manageMembers
      ? prisma.invitation.findMany({
          where: {
            workspaceId: active.workspace.id,
            status: "pending",
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your workspace profile, team, and preferences."
        badge={<RoleBadge role={role} />}
      />

      <SectionCard
        title="Workspace profile"
        description="Basic business details used across Tripistic."
      >
        <WorkspaceSettingsForm
          workspace={{
            id: active.workspace.id,
            name: active.workspace.name,
            businessType: active.workspace.businessType,
            timezone: active.workspace.timezone,
            currency: active.workspace.currency,
            country: active.workspace.country,
          }}
          canEdit={canManageWorkspace(role)}
        />
      </SectionCard>

      {showMembers ? (
        <SectionCard
          id="members"
          title="Members & invitations"
          description="Who can access this workspace and what they can do."
        >
          <MembersPanel
            workspaceId={active.workspace.id}
            currentUserId={user.id}
            canManage={manageMembers}
            grantableRoles={grantableRoles(role) as WorkspaceRoleValue[]}
            members={members.map((member) => ({
              id: member.id,
              userId: member.userId,
              name: member.user.name,
              email: member.user.email,
              role: member.role as WorkspaceRoleValue,
              status: member.status,
              canModify:
                member.userId !== user.id && canModifyMemberWithRole(role, member.role),
            }))}
            invitations={invitations.map((invitation) => ({
              id: invitation.id,
              email: invitation.email,
              role: invitation.role as WorkspaceRoleValue,
              status: invitation.status,
              token: invitation.token,
              expiresAt: invitation.expiresAt.toISOString(),
            }))}
          />
        </SectionCard>
      ) : null}

      <SectionCard
        title="Workspace details"
        description="Reference information about this workspace."
      >
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">Workspace slug</dt>
            <dd className="font-medium text-foreground">{active.workspace.slug}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">Business type</dt>
            <dd className="font-medium text-foreground">
              {BUSINESS_TYPE_LABELS[
                active.workspace.businessType as keyof typeof BUSINESS_TYPE_LABELS
              ] ?? active.workspace.businessType}
            </dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">Created</dt>
            <dd className="font-medium text-foreground">
              {formatDate(active.workspace.createdAt)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">Booking page & policies</dt>
            <dd className="font-medium text-muted-foreground">
              Live now, per tour — cancellation policy is set on each tour. Workspace-wide branding is on the
              roadmap.
            </dd>
          </div>
        </dl>
      </SectionCard>
    </>
  );
}
