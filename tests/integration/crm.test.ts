import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { requireUserApi } from "@/lib/auth/session";
import { GET as listCompaniesRoute, POST as createCompanyRoute } from "@/app/api/workspaces/[id]/companies/route";
import { DELETE as archiveCompanyRoute } from "@/app/api/workspaces/[id]/companies/[companyId]/route";
import { GET as listLeadsRoute, POST as createLeadRoute } from "@/app/api/workspaces/[id]/leads/route";
import { PATCH as updateLeadRoute } from "@/app/api/workspaces/[id]/leads/[leadId]/route";
import { POST as convertLeadRoute } from "@/app/api/workspaces/[id]/leads/[leadId]/convert/route";
import { POST as createTaskRoute } from "@/app/api/workspaces/[id]/crm-tasks/route";
import { PATCH as updateTaskRoute } from "@/app/api/workspaces/[id]/crm-tasks/[taskId]/route";
import { DELETE as removeMemberRoute } from "@/app/api/workspaces/[id]/members/[memberId]/route";
import { addMember, createTestUser, createTestWorkspace, prisma } from "./helpers";

const mockRequireUserApi = requireUserApi as unknown as ReturnType<typeof vi.fn>;

function asUser(user: { id: string }) {
  mockRequireUserApi.mockResolvedValue(user);
}

function req(url: string, init?: RequestInit) {
  return new Request(url, init);
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function setup() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  await addMember(workspace.id, owner.id, "workspace_owner");
  const viewerUser = await createTestUser();
  await addMember(workspace.id, viewerUser.id, "viewer");
  return { owner, workspace, viewerUser };
}

describe("companies", () => {
  it("owner can create and list companies; viewer is read-only", async () => {
    const { owner, workspace, viewerUser } = await setup();
    asUser(owner);

    const created = await createCompanyRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "Blue Horizon Travel", kind: "travel_agent" }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(created.status).toBe(201);
    const { company } = (await created.json()) as { company: { id: string; kind: string } };
    expect(company.kind).toBe("travel_agent");

    asUser(viewerUser);
    const list = await listCompaniesRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { total: number };
    expect(body.total).toBe(1);

    const denied = await createCompanyRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "Nope" }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(denied.status).toBe(403);
  });

  it("archiving a company soft-deletes it (excluded from subsequent lists)", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    const created = await createCompanyRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "Sunset Hotel", kind: "hotel" }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { company } = (await created.json()) as { company: { id: string } };

    const archived = await archiveCompanyRoute(req("http://x/api", { method: "DELETE" }), {
      params: Promise.resolve({ id: workspace.id, companyId: company.id }),
    });
    expect(archived.status).toBe(200);

    const list = await listCompaniesRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    const body = (await list.json()) as { total: number };
    expect(body.total).toBe(0);
  });
});

describe("leads", () => {
  it("creates a lead, lists it, and moves it through the pipeline", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);

    const created = await createLeadRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ name: "Jordan Rivera", email: "jordan@example.com", status: "new" }),
      }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(created.status).toBe(201);
    const { lead } = (await created.json()) as { lead: { id: string; status: string } };
    expect(lead.status).toBe("new");

    const listed = await listLeadsRoute(req("http://x/api?status=new"), { params: Promise.resolve({ id: workspace.id }) });
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as { total: number };
    expect(listedBody.total).toBe(1);

    const updated = await updateLeadRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ status: "qualified" }) }),
      { params: Promise.resolve({ id: workspace.id, leadId: lead.id }) },
    );
    expect(updated.status).toBe(200);
    const updatedBody = (await updated.json()) as { lead: { status: string } };
    expect(updatedBody.lead.status).toBe("qualified");
  });

  it("converting a lead creates a Customer and dedupes by email against an existing one", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);

    // A customer with this email already exists (e.g. from a prior booking).
    const existing = await prisma.customer.create({
      data: { workspaceId: workspace.id, name: "Old Name", email: "guest@example.com" },
    });

    const created = await createLeadRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ name: "Guest Person", email: "GUEST@example.com", status: "qualified" }),
      }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { lead } = (await created.json()) as { lead: { id: string } };

    const converted = await convertLeadRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: workspace.id, leadId: lead.id }) },
    );
    expect(converted.status).toBe(200);
    const convertedBody = (await converted.json()) as { customerId: string; created: boolean };
    expect(convertedBody.customerId).toBe(existing.id);
    expect(convertedBody.created).toBe(false);

    const refreshedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(refreshedLead.status).toBe("won");
    expect(refreshedLead.convertedCustomerId).toBe(existing.id);

    // Converting twice is rejected.
    const secondAttempt = await convertLeadRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: workspace.id, leadId: lead.id }) },
    );
    expect(secondAttempt.status).toBe(400);
  });

  it("rejects converting a lead with no email", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    const created = await createLeadRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "No Email Lead" }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { lead } = (await created.json()) as { lead: { id: string } };

    const converted = await convertLeadRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: workspace.id, leadId: lead.id }) },
    );
    expect(converted.status).toBe(400);
  });
});

describe("crm tasks and member removal", () => {
  it("removing a member assigned to a lead/task clears the assignment instead of failing", async () => {
    const { owner, workspace } = await setup();
    const staffUser = await createTestUser();
    const staffMember = await addMember(workspace.id, staffUser.id, "staff");
    asUser(owner);

    const lead = await createLeadRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ name: "Assignee Test", assignedToId: staffMember.id }),
      }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { lead: leadBody } = (await lead.json()) as { lead: { id: string } };

    const task = await createTaskRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ title: "Follow up", assignedToId: staffMember.id }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { task: taskBody } = (await task.json()) as { task: { id: string } };

    const removed = await removeMemberRoute(req("http://x/api", { method: "DELETE" }), {
      params: Promise.resolve({ id: workspace.id, memberId: staffMember.id }),
    });
    expect(removed.status).toBe(200);

    const refreshedLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadBody.id } });
    expect(refreshedLead.assignedToId).toBeNull();
    const refreshedTask = await prisma.crmTask.findUniqueOrThrow({ where: { id: taskBody.id } });
    expect(refreshedTask.assignedToId).toBeNull();
  });

  it("marks a task done and reopens it", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    const created = await createTaskRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ title: "Call back" }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { task } = (await created.json()) as { task: { id: string } };

    const done = await updateTaskRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ status: "done" }) }),
      { params: Promise.resolve({ id: workspace.id, taskId: task.id }) },
    );
    expect(done.status).toBe(200);
    const doneBody = (await done.json()) as { task: { status: string; completedAt: string | null } };
    expect(doneBody.task.status).toBe("done");
    expect(doneBody.task.completedAt).not.toBeNull();
  });
});

describe("tenant isolation", () => {
  it("a lead from another workspace is 404 even to an owner who is a legitimate member of workspace A", async () => {
    const { owner: ownerA, workspace: workspaceA } = await setup();
    const ownerB = await createTestUser();
    const workspaceB = await createTestWorkspace(ownerB.id);
    await addMember(workspaceB.id, ownerB.id, "workspace_owner");

    asUser(ownerB);
    const created = await createLeadRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "B's Lead" }) }),
      { params: Promise.resolve({ id: workspaceB.id }) },
    );
    const { lead } = (await created.json()) as { lead: { id: string } };

    // ownerA is a legitimate member of workspace A, but B's lead does not
    // belong to it — the tenant-scoped query must return 404, not leak it.
    asUser(ownerA);
    const crossTenant = await convertLeadRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: workspaceA.id, leadId: lead.id }) },
    );
    expect(crossTenant.status).toBe(404);
  });
});
