import type { Company, CrmTask, Lead } from "@prisma/client";

export function serializeCompany(company: Company & { _count?: { customers: number; leads: number } }) {
  return {
    id: company.id,
    name: company.name,
    kind: company.kind,
    email: company.email,
    phone: company.phone,
    website: company.website,
    country: company.country,
    commissionRateBps: company.commissionRateBps,
    notes: company.notes,
    customerCount: company._count?.customers ?? 0,
    leadCount: company._count?.leads ?? 0,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

type LeadWithRelations = Lead & {
  company?: { id: string; name: string } | null;
  assignedTo?: { id: string; user: { name: string } } | null;
  convertedCustomer?: { id: string; name: string } | null;
};

export function serializeLead(lead: LeadWithRelations) {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company ? { id: lead.company.id, name: lead.company.name } : null,
    source: lead.source,
    status: lead.status,
    estimatedValueCents: lead.estimatedValueCents,
    currency: lead.currency,
    tags: lead.tags,
    notes: lead.notes,
    assignedTo: lead.assignedTo
      ? { id: lead.assignedTo.id, name: lead.assignedTo.user.name }
      : null,
    convertedCustomer: lead.convertedCustomer
      ? { id: lead.convertedCustomer.id, name: lead.convertedCustomer.name }
      : null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

type CrmTaskWithRelations = CrmTask & {
  assignedTo?: { id: string; user: { name: string } } | null;
  customer?: { id: string; name: string } | null;
  lead?: { id: string; name: string } | null;
};

export function serializeCrmTask(task: CrmTaskWithRelations) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueAt: task.dueAt?.toISOString() ?? null,
    status: task.status,
    completedAt: task.completedAt?.toISOString() ?? null,
    assignedTo: task.assignedTo ? { id: task.assignedTo.id, name: task.assignedTo.user.name } : null,
    customer: task.customer ? { id: task.customer.id, name: task.customer.name } : null,
    lead: task.lead ? { id: task.lead.id, name: task.lead.name } : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
