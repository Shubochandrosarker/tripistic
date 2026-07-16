import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api";
import type { CrmTaskListQuery } from "./types";

async function requireAssignableMember(workspaceId: string, memberId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId, status: "active" },
  });
  if (!member) throw badRequest("That member is not an active member of this workspace.");
  if (member.role === "viewer") throw badRequest("A viewer cannot be assigned a task.");
  return member;
}

async function requireLinkedEntities(
  workspaceId: string,
  customerId?: string | null,
  leadId?: string | null,
) {
  if (customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, workspaceId, deletedAt: null } });
    if (!customer) throw badRequest("That customer was not found in this workspace.");
  }
  if (leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
    if (!lead) throw badRequest("That lead was not found in this workspace.");
  }
}

export async function requireCrmTask(workspaceId: string, taskId: string) {
  const task = await prisma.crmTask.findFirst({ where: { id: taskId, workspaceId } });
  if (!task) throw notFound("Task not found");
  return task;
}

const TASK_INCLUDE = {
  assignedTo: { select: { id: true, user: { select: { name: true } } } },
  customer: { select: { id: true, name: true } },
  lead: { select: { id: true, name: true } },
} satisfies Prisma.CrmTaskInclude;

export function buildCrmTaskListQuery(workspaceId: string, query: CrmTaskListQuery) {
  const where: Prisma.CrmTaskWhereInput = { workspaceId };
  if (query.status) where.status = query.status;
  if (query.assignedToId) where.assignedToId = query.assignedToId;
  if (query.customerId) where.customerId = query.customerId;
  if (query.leadId) where.leadId = query.leadId;

  return {
    where,
    orderBy: [{ status: "asc" as const }, { dueAt: "asc" as const }, { createdAt: "desc" as const }],
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export async function listCrmTasks(workspaceId: string, query: CrmTaskListQuery) {
  const { where, orderBy, skip, take } = buildCrmTaskListQuery(workspaceId, query);
  const [tasks, total] = await Promise.all([
    prisma.crmTask.findMany({ where, orderBy, skip, take, include: TASK_INCLUDE }),
    prisma.crmTask.count({ where }),
  ]);
  return { tasks, total };
}

export type CreateCrmTaskInput = {
  title: string;
  description?: string;
  dueAt?: Date;
  customerId?: string;
  leadId?: string;
  assignedToId?: string;
  createdById?: string;
};

export async function createCrmTask(workspaceId: string, input: CreateCrmTaskInput) {
  await requireLinkedEntities(workspaceId, input.customerId, input.leadId);
  if (input.assignedToId) await requireAssignableMember(workspaceId, input.assignedToId);

  return prisma.crmTask.create({
    data: {
      workspaceId,
      title: input.title,
      description: input.description ?? null,
      dueAt: input.dueAt ?? null,
      customerId: input.customerId ?? null,
      leadId: input.leadId ?? null,
      assignedToId: input.assignedToId ?? null,
      createdById: input.createdById ?? null,
    },
    include: TASK_INCLUDE,
  });
}

export type UpdateCrmTaskInput = {
  title?: string;
  description?: string;
  dueAt?: Date | null;
  status?: "open" | "done";
  assignedToId?: string | null;
};

export async function updateCrmTask(workspaceId: string, taskId: string, input: UpdateCrmTaskInput) {
  await requireCrmTask(workspaceId, taskId);
  if (input.assignedToId) await requireAssignableMember(workspaceId, input.assignedToId);

  return prisma.crmTask.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
      ...(input.status !== undefined
        ? { status: input.status, completedAt: input.status === "done" ? new Date() : null }
        : {}),
    },
    include: TASK_INCLUDE,
  });
}
