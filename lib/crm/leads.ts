import type { Prisma } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api";
import type { LeadListQuery } from "./types";

export async function requireLead(workspaceId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
  if (!lead) throw notFound("Lead not found");
  return lead;
}

/** Eligibility check for `Lead.assignedToId` — same rule as guide assignment: active member, not a viewer. */
async function requireAssignableMember(workspaceId: string, memberId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId, status: "active" },
  });
  if (!member) throw badRequest("That member is not an active member of this workspace.");
  if (member.role === "viewer") throw badRequest("A viewer cannot be assigned a lead.");
  return member;
}

export function buildLeadListQuery(workspaceId: string, query: LeadListQuery) {
  const where: Prisma.LeadWhereInput = { workspaceId };
  if (query.status) where.status = query.status;

  if (query.search) {
    const search = query.search.trim();
    if (search.length > 0) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }
  }

  return {
    where,
    orderBy: { createdAt: "desc" as const },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

const LEAD_INCLUDE = {
  company: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, user: { select: { name: true } } } },
  convertedCustomer: { select: { id: true, name: true } },
} satisfies Prisma.LeadInclude;

export async function listLeads(workspaceId: string, query: LeadListQuery) {
  const { where, orderBy, skip, take } = buildLeadListQuery(workspaceId, query);
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({ where, orderBy, skip, take, include: LEAD_INCLUDE }),
    prisma.lead.count({ where }),
  ]);
  return { leads, total };
}

export async function getLead(workspaceId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId },
    include: {
      ...LEAD_INCLUDE,
      tasks: { orderBy: { createdAt: "desc" }, take: 25 },
      activities: { orderBy: { occurredAt: "desc" }, take: 25 },
    },
  });
  if (!lead) throw notFound("Lead not found");
  return lead;
}

export type CreateLeadInput = {
  name: string;
  email?: string;
  phone?: string;
  companyId?: string;
  source?: string;
  status?: "new" | "contacted" | "qualified" | "proposal_sent" | "won" | "lost";
  estimatedValueCents?: number;
  currency?: string;
  tags?: string[];
  notes?: string;
  assignedToId?: string;
  createdById?: string;
};

async function requireCompanyIfSet(workspaceId: string, companyId?: string | null) {
  if (!companyId) return;
  const company = await prisma.company.findFirst({ where: { id: companyId, workspaceId, deletedAt: null } });
  if (!company) throw badRequest("That company was not found in this workspace.");
}

export async function createLead(workspaceId: string, input: CreateLeadInput) {
  await requireCompanyIfSet(workspaceId, input.companyId);
  if (input.assignedToId) await requireAssignableMember(workspaceId, input.assignedToId);

  return prisma.lead.create({
    data: {
      workspaceId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      companyId: input.companyId ?? null,
      source: input.source ?? null,
      status: input.status ?? "new",
      estimatedValueCents: input.estimatedValueCents ?? null,
      currency: input.currency ?? "USD",
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      assignedToId: input.assignedToId ?? null,
      createdById: input.createdById ?? null,
    },
    include: LEAD_INCLUDE,
  });
}

export type UpdateLeadInput = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  source?: string;
  status?: "new" | "contacted" | "qualified" | "proposal_sent" | "won" | "lost";
  estimatedValueCents?: number | null;
  currency?: string;
  tags?: string[];
  notes?: string;
  assignedToId?: string | null;
};

export async function updateLead(workspaceId: string, leadId: string, input: UpdateLeadInput) {
  const existing = await requireLead(workspaceId, leadId);
  if (input.companyId !== undefined) await requireCompanyIfSet(workspaceId, input.companyId);
  if (input.assignedToId) await requireAssignableMember(workspaceId, input.assignedToId);
  if (existing.status === "won" || existing.status === "lost") {
    if (input.status && input.status !== existing.status) {
      throw badRequest("This lead is closed. Reopen it by editing its status directly if needed.");
    }
  }

  return prisma.lead.update({
    where: { id: leadId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.estimatedValueCents !== undefined ? { estimatedValueCents: input.estimatedValueCents } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
    },
    include: LEAD_INCLUDE,
  });
}

export type ConvertLeadResult = { customerId: string; created: boolean };

/**
 * Converts a lead into a real Customer. Deduped by (workspaceId, email) —
 * same rule `upsertCustomerForBooking` uses — so converting a lead whose
 * email already matches an existing customer links to that customer rather
 * than creating a duplicate. A lead with no email cannot be converted (a
 * Customer requires one); the caller surfaces that as a 400.
 */
export async function convertLead(
  workspaceId: string,
  leadId: string,
  actorUserId: string | null,
  bookingNote?: string,
): Promise<ConvertLeadResult> {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) throw notFound("Lead not found");
    if (lead.convertedCustomerId) throw badRequest("This lead has already been converted.");
    if (!lead.email) throw badRequest("This lead needs an email address before it can be converted to a customer.");

    const email = lead.email.trim().toLowerCase();
    const existingCustomer = await tx.customer.findUnique({
      where: { workspaceId_email: { workspaceId, email } },
    });

    const customer = existingCustomer
      ? await tx.customer.update({
          where: { id: existingCustomer.id },
          data: {
            phone: existingCustomer.phone ?? lead.phone ?? undefined,
            companyId: existingCustomer.companyId ?? lead.companyId ?? undefined,
            tags: Array.from(new Set([...existingCustomer.tags, ...lead.tags])),
          },
        })
      : await tx.customer.create({
          data: {
            workspaceId,
            name: lead.name,
            email,
            phone: lead.phone,
            companyId: lead.companyId,
            tags: lead.tags,
            notes: lead.notes,
          },
        });

    await tx.lead.update({
      where: { id: leadId },
      data: { status: "won", convertedCustomerId: customer.id },
    });

    await tx.crmActivity.create({
      data: {
        workspaceId,
        leadId,
        type: "status_change",
        subject: "Lead converted",
        body: bookingNote ?? `Converted to customer ${customer.name}.`,
        createdById: actorUserId,
      },
    });

    return { customerId: customer.id, created: !existingCustomer };
  });
}

/**
 * Clears `assignedToId` on every Lead/CrmTask this member is assigned to.
 * Called from member removal, inside the same transaction as the delete —
 * both relations are `onDelete: Restrict` (a composite FK can't null a
 * required workspace_id column), so this explicit clear is what keeps
 * removal from ever failing on a former assignee. Same pattern as
 * `clearGuideAssignments` in lib/guides/service.ts.
 */
export async function clearCrmAssignments(tx: Db, workspaceId: string, memberId: string) {
  const [leads, tasks] = await Promise.all([
    tx.lead.updateMany({ where: { workspaceId, assignedToId: memberId }, data: { assignedToId: null } }),
    tx.crmTask.updateMany({ where: { workspaceId, assignedToId: memberId }, data: { assignedToId: null } }),
  ]);
  return { clearedLeads: leads.count, clearedTasks: tasks.count };
}
