import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { requireUserApi } from "@/lib/auth/session";
import { GET as listVendorsRoute, POST as createVendorRoute } from "@/app/api/workspaces/[id]/vendors/route";
import { PATCH as updateVendorRoute } from "@/app/api/workspaces/[id]/vendors/[vendorId]/route";
import { GET as listInvoicesRoute, POST as createInvoiceRoute } from "@/app/api/workspaces/[id]/vendors/[vendorId]/invoices/route";
import { PATCH as updateInvoiceRoute } from "@/app/api/workspaces/[id]/vendors/[vendorId]/invoices/[invoiceId]/route";
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
  const staffUser = await createTestUser();
  await addMember(workspace.id, staffUser.id, "staff");
  return { owner, workspace, staffUser };
}

describe("vendors", () => {
  it("owner manages vendors; staff can view but not create/edit (owner/admin-only tier)", async () => {
    const { owner, workspace, staffUser } = await setup();
    asUser(owner);

    const created = await createVendorRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "Riverside Lodge", kind: "hotel", rating: 4 }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(created.status).toBe(201);
    const { vendor } = (await created.json()) as { vendor: { id: string } };

    asUser(staffUser);
    const list = await listVendorsRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(list.status).toBe(200);

    const denied = await updateVendorRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ rating: 5 }) }),
      { params: Promise.resolve({ id: workspace.id, vendorId: vendor.id }) },
    );
    expect(denied.status).toBe(403);
  });

  it("rejects a rating outside 1-5 at the database CHECK constraint", async () => {
    const { workspace } = await setup();
    await expect(
      prisma.vendor.create({ data: { workspaceId: workspace.id, name: "Bad Rating Co", rating: 7 } }),
    ).rejects.toThrow();
  });
});

describe("vendor invoices", () => {
  it("creates an invoice, sweeps it to overdue past its due date, and marks it paid", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    const created = await createVendorRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "Mountain Transport", kind: "transport" }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { vendor } = (await created.json()) as { vendor: { id: string } };

    const invoice = await createInvoiceRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ amountCents: 15000, issuedOn: "2020-01-01", dueOn: "2020-01-15" }),
      }),
      { params: Promise.resolve({ id: workspace.id, vendorId: vendor.id }) },
    );
    expect(invoice.status).toBe(201);
    const { invoice: invoiceBody } = (await invoice.json()) as { invoice: { id: string; status: string } };
    expect(invoiceBody.status).toBe("unpaid");

    // Listing sweeps unpaid-and-past-due invoices to overdue.
    const list = await listInvoicesRoute(req("http://x/api"), {
      params: Promise.resolve({ id: workspace.id, vendorId: vendor.id }),
    });
    const listBody = (await list.json()) as { invoices: { id: string; status: string }[] };
    expect(listBody.invoices.find((i) => i.id === invoiceBody.id)?.status).toBe("overdue");

    const paid = await updateInvoiceRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ status: "paid" }) }),
      { params: Promise.resolve({ id: workspace.id, vendorId: vendor.id, invoiceId: invoiceBody.id }) },
    );
    expect(paid.status).toBe(200);
    const paidBody = (await paid.json()) as { invoice: { status: string; paidAt: string | null } };
    expect(paidBody.invoice.status).toBe("paid");
    expect(paidBody.invoice.paidAt).not.toBeNull();
  });

  it("a cancelled invoice cannot be edited further", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    const created = await createVendorRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "Local Guides Co" }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { vendor } = (await created.json()) as { vendor: { id: string } };

    const invoice = await createInvoiceRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ amountCents: 5000, issuedOn: "2026-07-01" }) }),
      { params: Promise.resolve({ id: workspace.id, vendorId: vendor.id }) },
    );
    const { invoice: invoiceBody } = (await invoice.json()) as { invoice: { id: string } };

    await updateInvoiceRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }),
      { params: Promise.resolve({ id: workspace.id, vendorId: vendor.id, invoiceId: invoiceBody.id }) },
    );

    const secondEdit = await updateInvoiceRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ status: "paid" }) }),
      { params: Promise.resolve({ id: workspace.id, vendorId: vendor.id, invoiceId: invoiceBody.id }) },
    );
    expect(secondEdit.status).toBe(400);
  });
});
