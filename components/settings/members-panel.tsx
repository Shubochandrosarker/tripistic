"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { RoleBadge } from "@/components/ui/role-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ROLE_LABELS, type WorkspaceRoleValue } from "@/lib/constants";
import { initials } from "@/lib/utils";

export type MemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRoleValue;
  status: string;
  canModify: boolean;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: WorkspaceRoleValue;
  status: string;
  token: string;
  expiresAt: string;
};

export function MembersPanel({
  workspaceId,
  currentUserId,
  canManage,
  grantableRoles,
  members,
  invitations,
}: {
  workspaceId: string;
  currentUserId: string;
  canManage: boolean;
  grantableRoles: WorkspaceRoleValue[];
  members: MemberRow[];
  invitations: InvitationRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  async function api(path: string, init: RequestInit): Promise<boolean> {
    resetMessages();
    setBusy(true);
    try {
      const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "The action failed. Try again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("The action failed. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get("email") ?? "");
    const role = String(form.get("role") ?? "viewer");

    resetMessages();
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; inviteUrl?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? "Could not create the invitation.");
        return;
      }
      formElement.reset();
      setNotice(
        "Invitation created and emailed. You can also copy the invite link below and share it directly.",
      );
      router.refresh();
    } catch {
      setError("Could not create the invitation. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onChangeRole(member: MemberRow, role: string) {
    await api(`/api/workspaces/${workspaceId}/members/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  }

  async function onRemove() {
    if (!removeTarget) return;
    const ok = await api(`/api/workspaces/${workspaceId}/members/${removeTarget.id}`, {
      method: "DELETE",
    });
    if (ok) setRemoveTarget(null);
  }

  async function onRevoke(invitationId: string) {
    await api(`/api/workspaces/${workspaceId}/invitations/${invitationId}`, {
      method: "DELETE",
    });
  }

  async function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      setNotice(`Invite link: ${url}`);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          {notice}
        </p>
      ) : null}

      {/* Members */}
      <ul className="divide-y divide-border">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {initials(member.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {member.name}
                {member.userId === currentUserId ? (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{member.email}</p>
            </div>
            {member.status !== "active" ? <StatusBadge status={member.status} /> : null}
            {canManage && member.canModify ? (
              <div className="flex items-center gap-2">
                <Select
                  aria-label={`Role for ${member.name}`}
                  className="h-8 w-40 text-xs"
                  value={member.role}
                  disabled={busy}
                  onChange={(event) => onChangeRole(member, event.target.value)}
                >
                  {grantableRoles.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                  {!grantableRoles.includes(member.role) ? (
                    <option value={member.role} disabled>
                      {ROLE_LABELS[member.role]}
                    </option>
                  ) : null}
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${member.name}`}
                  disabled={busy}
                  onClick={() => setRemoveTarget(member)}
                >
                  <Trash2 className="size-4 text-red-500" aria-hidden />
                </Button>
              </div>
            ) : (
              <RoleBadge role={member.role} />
            )}
          </li>
        ))}
      </ul>

      {/* Pending invitations */}
      {canManage && invitations.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pending invitations
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <RoleBadge role={invitation.role} />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => copyInviteLink(invitation.token)}
                >
                  {copiedToken === invitation.token ? (
                    <>
                      <Check className="size-3.5" aria-hidden /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" aria-hidden /> Copy link
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRevoke(invitation.id)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Invite form */}
      {canManage ? (
        <form onSubmit={onInvite} className="rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2">
            <UserPlus className="size-4 text-accent" aria-hidden />
            <h3 className="text-sm font-semibold text-foreground">Invite a team member</h3>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field label="Email" htmlFor="invite-email">
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder="teammate@business.com"
                required
              />
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <Select id="invite-role" name="role" defaultValue="staff" className="sm:w-40">
                {grantableRoles.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Invitations expire after 7 days and are emailed automatically — you can also copy and
            share the invite link directly.
          </p>
        </form>
      ) : null}

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove member?"
        description={
          removeTarget
            ? `${removeTarget.name} will lose access to this workspace immediately.`
            : ""
        }
        confirmLabel="Remove member"
        danger
        busy={busy}
        onConfirm={onRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
