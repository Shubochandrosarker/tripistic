import type { Metadata } from "next";
import Link from "next/link";
import { Compass, MailX } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ROLE_LABELS, type WorkspaceRoleValue } from "@/lib/constants";
import { ButtonLink } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/role-badge";
import { AcceptInviteButton } from "@/components/invite/accept-invite-button";

export const metadata: Metadata = {
  title: "Invitation",
};

function InviteFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Compass className="size-5" aria-hidden />
        </span>
        <span className="text-lg font-semibold tracking-tight text-foreground">Tripistic</span>
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-xs">
        {children}
      </div>
    </div>
  );
}

function InvalidInvite({ reason }: { reason: string }) {
  return (
    <InviteFrame>
      <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <MailX className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-base font-semibold text-foreground">
        This invitation can&apos;t be used
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{reason}</p>
      <div className="mt-5">
        <ButtonLink href="/dashboard" variant="secondary" className="w-full">
          Go to dashboard
        </ButtonLink>
      </div>
    </InviteFrame>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await requireUserPage();

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { workspace: { select: { id: true, name: true, deletedAt: true } } },
  });

  if (!invitation || invitation.workspace.deletedAt) {
    return <InvalidInvite reason="The invitation link is invalid. Ask the workspace owner to send a new one." />;
  }
  if (invitation.status === "revoked") {
    return <InvalidInvite reason="This invitation was revoked by the workspace." />;
  }
  if (invitation.status === "accepted") {
    return <InvalidInvite reason="This invitation has already been used." />;
  }
  if (invitation.status === "expired" || invitation.expiresAt < new Date()) {
    return <InvalidInvite reason="This invitation has expired. Ask the workspace owner to send a new one." />;
  }
  if (invitation.email !== user.email.toLowerCase()) {
    return (
      <InvalidInvite
        reason={`This invitation was sent to ${invitation.email}, but you are signed in as ${user.email}. Sign in with the invited email to accept.`}
      />
    );
  }

  const existingMembership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: invitation.workspaceId, userId: user.id },
  });

  return (
    <InviteFrame>
      <h1 className="text-base font-semibold text-foreground">
        Join {invitation.workspace.name}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        You&apos;ve been invited to join{" "}
        <span className="font-medium text-foreground">{invitation.workspace.name}</span> as{" "}
        {ROLE_LABELS[invitation.role as WorkspaceRoleValue] ?? invitation.role}.
      </p>
      <div className="mt-3 flex justify-center">
        <RoleBadge role={invitation.role as WorkspaceRoleValue} />
      </div>
      <div className="mt-5">
        {existingMembership ? (
          <ButtonLink href="/dashboard" className="w-full">
            You&apos;re already a member — open dashboard
          </ButtonLink>
        ) : (
          <AcceptInviteButton token={token} />
        )}
      </div>
    </InviteFrame>
  );
}
