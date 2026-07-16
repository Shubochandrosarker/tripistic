import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/api";
import type { IncidentListQuery } from "./types";

export async function requireIncident(workspaceId: string, incidentId: string) {
  const incident = await prisma.incidentReport.findFirst({ where: { id: incidentId, workspaceId } });
  if (!incident) throw notFound("Incident not found");
  return incident;
}

export function buildIncidentListQuery(workspaceId: string, query: IncidentListQuery) {
  const where: Prisma.IncidentReportWhereInput = { workspaceId };
  if (query.status) where.status = query.status;
  if (query.severity) where.severity = query.severity;

  return {
    where,
    orderBy: [{ status: "asc" as const }, { createdAt: "desc" as const }],
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export async function listIncidents(workspaceId: string, query: IncidentListQuery) {
  const { where, orderBy, skip, take } = buildIncidentListQuery(workspaceId, query);
  const [incidents, total] = await Promise.all([
    prisma.incidentReport.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { availability: { select: { id: true, startsAt: true, tour: { select: { title: true } } } } },
    }),
    prisma.incidentReport.count({ where }),
  ]);
  return { incidents, total };
}

/** Any open critical-severity incident today — powers the ops board's "Emergency Mode" banner. */
export async function hasActiveEmergency(workspaceId: string): Promise<boolean> {
  const emergency = await prisma.incidentReport.findFirst({
    where: { workspaceId, severity: "critical", status: { in: ["open", "investigating"] } },
    select: { id: true },
  });
  return Boolean(emergency);
}

export type CreateIncidentInput = {
  availabilityId?: string;
  severity?: "low" | "medium" | "high" | "critical";
  category?: "medical" | "vehicle" | "weather" | "guest_behavior" | "other";
  description: string;
  reportedById?: string;
};

export async function createIncident(workspaceId: string, input: CreateIncidentInput) {
  if (input.availabilityId) {
    const availability = await prisma.availability.findFirst({ where: { id: input.availabilityId, workspaceId } });
    if (!availability) throw notFound("Departure not found");
  }

  const incident = await prisma.incidentReport.create({
    data: {
      workspaceId,
      availabilityId: input.availabilityId ?? null,
      severity: input.severity ?? "medium",
      category: input.category ?? "other",
      description: input.description,
      reportedById: input.reportedById ?? null,
    },
  });

  if (input.availabilityId) {
    await prisma.opsEvent.create({
      data: {
        workspaceId,
        availabilityId: input.availabilityId,
        type: "incident_reported",
        message: `${input.severity ?? "medium"} severity incident reported: ${input.description.slice(0, 200)}`,
        actorUserId: input.reportedById ?? null,
      },
    });
  }

  return incident;
}

export type UpdateIncidentInput = {
  severity?: "low" | "medium" | "high" | "critical";
  category?: "medical" | "vehicle" | "weather" | "guest_behavior" | "other";
  status?: "open" | "investigating" | "resolved";
  description?: string;
  resolutionNotes?: string;
};

export async function updateIncident(workspaceId: string, incidentId: string, input: UpdateIncidentInput) {
  await requireIncident(workspaceId, incidentId);
  return prisma.incidentReport.update({
    where: { id: incidentId },
    data: {
      ...(input.severity !== undefined ? { severity: input.severity } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.resolutionNotes !== undefined ? { resolutionNotes: input.resolutionNotes } : {}),
      ...(input.status !== undefined
        ? { status: input.status, resolvedAt: input.status === "resolved" ? new Date() : null }
        : {}),
    },
  });
}
