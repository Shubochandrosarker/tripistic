import { describe, expect, it } from "vitest";

import {
  setPlatformAdmin,
  setUserStatus,
  setWorkspaceStatus,
} from "@/lib/admin/platform-actions";
import { createTestUser, createTestWorkspace, prisma } from "./helpers";

/**
 * Phase 11 — platform-admin operational controls.
 *
 * The whole super-admin surface was read-only. `app/admin/workspaces` said so
 * out loud ("Management actions arrive in later phases") and every admin API
 * exposed `GET` and nothing else, so suspending an abusive workspace or
 * locking out a compromised account meant opening psql against production —
 * with no audit trail.
 *
 * The refusals below matter more than the happy paths: each one is a way to
 * lock the platform's own operators out of it.
 */

async function admin() {
  const user = await createTestUser();
  return prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
}

describe("workspace suspension", () => {
  it("suspends and reactivates without destroying anything", async () => {
    const owner = await createTestUser();
    const actor = await admin();
    const workspace = await createTestWorkspace(owner.id);

    const suspended = await setWorkspaceStatus(workspace.id, "suspended", { actorId: actor.id });
    expect(suspended.workspace.status).toBe("suspended");
    expect(suspended.changed).toBe(true);

    // Reversible, and the workspace itself is untouched.
    const restored = await setWorkspaceStatus(workspace.id, "active", { actorId: actor.id });
    expect(restored.workspace.status).toBe("active");
    expect(await prisma.workspace.findUnique({ where: { id: workspace.id } })).not.toBeNull();
  });

  it("is idempotent", async () => {
    const owner = await createTestUser();
    const actor = await admin();
    const workspace = await createTestWorkspace(owner.id, { status: "suspended" });

    const result = await setWorkspaceStatus(workspace.id, "suspended", { actorId: actor.id });
    expect(result.changed).toBe(false);
  });

  it("refuses to reactivate an archived workspace", async () => {
    // Archived is reached by the owner deleting their account; flipping it
    // back to active here would silently undo that decision.
    const owner = await createTestUser();
    const actor = await admin();
    const workspace = await createTestWorkspace(owner.id, { status: "archived" });

    await expect(
      setWorkspaceStatus(workspace.id, "active", { actorId: actor.id }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("404s an unknown workspace rather than reporting success", async () => {
    const actor = await admin();
    await expect(
      setWorkspaceStatus("ws_does_not_exist", "suspended", { actorId: actor.id }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("records who did it", async () => {
    const owner = await createTestUser();
    const actor = await admin();
    const workspace = await createTestWorkspace(owner.id);
    await setWorkspaceStatus(workspace.id, "suspended", { actorId: actor.id });

    const events = await prisma.auditLog.findMany({
      where: { workspaceId: workspace.id, action: "workspace_suspended" },
    });
    expect(events).toHaveLength(1);
    expect(events[0].userId).toBe(actor.id);
  });
});

describe("user suspension", () => {
  it("suspends and reactivates", async () => {
    const actor = await admin();
    const target = await createTestUser();

    expect((await setUserStatus(target.id, "suspended", { actorId: actor.id })).user.status).toBe(
      "suspended",
    );
    expect((await setUserStatus(target.id, "active", { actorId: actor.id })).user.status).toBe(
      "active",
    );
  });

  it("invalidates live sessions on suspension", async () => {
    // Without this, an account suspended because it was compromised keeps the
    // session it already has until the JWT expires — which is exactly the
    // window that mattered.
    const actor = await admin();
    const target = await createTestUser();
    const before = target.sessionVersion;

    await setUserStatus(target.id, "suspended", { actorId: actor.id });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.sessionVersion).toBe(before + 1);
  });

  it("does not bump the session version on reactivation", async () => {
    // Reactivating is not a security event; forcing everyone's sessions over
    // would be gratuitous.
    const actor = await admin();
    const target = await createTestUser();
    await setUserStatus(target.id, "suspended", { actorId: actor.id });
    const suspended = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

    await setUserStatus(target.id, "active", { actorId: actor.id });
    const reactivated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(reactivated.sessionVersion).toBe(suspended.sessionVersion);
  });

  it("refuses to let an admin suspend themselves", async () => {
    // The one mistake with no in-product recovery.
    const actor = await admin();
    await expect(
      setUserStatus(actor.id, "suspended", { actorId: actor.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("404s an unknown user", async () => {
    const actor = await admin();
    await expect(
      setUserStatus("user_does_not_exist", "suspended", { actorId: actor.id }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("platform admin access", () => {
  it("grants and revokes", async () => {
    const actor = await admin();
    const target = await createTestUser();

    expect((await setPlatformAdmin(target.id, true, { actorId: actor.id })).user.isPlatformAdmin).toBe(
      true,
    );
    expect((await setPlatformAdmin(target.id, false, { actorId: actor.id })).user.isPlatformAdmin).toBe(
      false,
    );
  });

  it("invalidates sessions in both directions", async () => {
    // The flag rides in the JWT, so on revoke an existing session would keep
    // the privilege after it was taken away.
    const actor = await admin();
    const target = await createTestUser();

    await setPlatformAdmin(target.id, true, { actorId: actor.id });
    const granted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(granted.sessionVersion).toBe(target.sessionVersion + 1);

    await setPlatformAdmin(target.id, false, { actorId: actor.id });
    const revoked = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(revoked.sessionVersion).toBe(granted.sessionVersion + 1);
  });

  it("refuses self-revocation", async () => {
    // Discovering the mistake usually means no longer being able to undo it.
    const actor = await admin();
    await expect(
      setPlatformAdmin(actor.id, false, { actorId: actor.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses to grant admin to a suspended account", async () => {
    // Almost certainly a mis-click, and it would take effect silently the
    // moment the account was reactivated.
    const actor = await admin();
    const target = await createTestUser();
    await setUserStatus(target.id, "suspended", { actorId: actor.id });

    await expect(
      setPlatformAdmin(target.id, true, { actorId: actor.id }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("records grants and revocations separately", async () => {
    const actor = await admin();
    const target = await createTestUser();
    await setPlatformAdmin(target.id, true, { actorId: actor.id });
    await setPlatformAdmin(target.id, false, { actorId: actor.id });

    const granted = await prisma.auditLog.count({
      where: { entityId: target.id, action: "platform_admin_granted" },
    });
    const revoked = await prisma.auditLog.count({
      where: { entityId: target.id, action: "platform_admin_revoked" },
    });
    expect(granted).toBe(1);
    expect(revoked).toBe(1);
  });
});
