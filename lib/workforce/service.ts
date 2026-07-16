import { prisma, type Db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api";

async function requireMember(workspaceId: string, memberId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
  if (!member) throw notFound("Member not found");
  return member;
}

/**
 * Clears `driverId` on every availability this member is assigned to as
 * driver. Mirrors `clearGuideAssignments` in lib/guides/service.ts exactly
 * — Availability.driver is also `onDelete: Restrict` (a composite FK can't
 * null a required workspace_id column).
 */
export async function clearDriverAssignments(tx: Db, workspaceId: string, memberId: string): Promise<number> {
  const result = await tx.availability.updateMany({
    where: { workspaceId, driverId: memberId },
    data: { driverId: null },
  });
  return result.count;
}

/** Bundles every Phase 6/7 assignment clear needed before a member can be safely removed. */
export async function clearWorkforceAssignments(tx: Db, workspaceId: string, memberId: string) {
  const clearedDriverAssignments = await clearDriverAssignments(tx, workspaceId, memberId);
  return { clearedDriverAssignments };
}

/* ------------------------------------------------------------------------ */
/* Time off                                                                 */
/* ------------------------------------------------------------------------ */

export async function listTimeOff(workspaceId: string, memberId?: string) {
  return prisma.staffTimeOff.findMany({
    where: { workspaceId, ...(memberId ? { memberId } : {}) },
    orderBy: { startsOn: "desc" },
    include: { member: { select: { id: true, user: { select: { name: true } } } } },
  });
}

export async function createTimeOff(
  workspaceId: string,
  memberId: string,
  input: { startsOn: Date; endsOn: Date; reason?: string; status?: "requested" | "approved" | "declined" },
) {
  await requireMember(workspaceId, memberId);
  return prisma.staffTimeOff.create({
    data: {
      workspaceId,
      memberId,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      reason: input.reason ?? null,
      status: input.status ?? "requested",
    },
  });
}

export async function updateTimeOffStatus(
  workspaceId: string,
  timeOffId: string,
  status: "requested" | "approved" | "declined",
) {
  const existing = await prisma.staffTimeOff.findFirst({ where: { id: timeOffId, workspaceId } });
  if (!existing) throw notFound("Time-off request not found");
  return prisma.staffTimeOff.update({ where: { id: timeOffId }, data: { status } });
}

/** True if `memberId` has an approved time-off window overlapping [startsAt, endsAt]. */
export async function hasApprovedTimeOffConflict(
  workspaceId: string,
  memberId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<boolean> {
  const conflict = await prisma.staffTimeOff.findFirst({
    where: {
      workspaceId,
      memberId,
      status: "approved",
      startsOn: { lte: endsAt },
      endsOn: { gte: startsAt },
    },
  });
  return Boolean(conflict);
}

/* ------------------------------------------------------------------------ */
/* Time entries (payroll hours)                                             */
/* ------------------------------------------------------------------------ */

export async function listTimeEntries(workspaceId: string, memberId?: string) {
  return prisma.staffTimeEntry.findMany({
    where: { workspaceId, ...(memberId ? { memberId } : {}) },
    orderBy: { workedOn: "desc" },
  });
}

export async function createTimeEntry(
  workspaceId: string,
  memberId: string,
  input: { workedOn: Date; minutes: number; availabilityId?: string; role?: string; note?: string; createdById?: string },
) {
  await requireMember(workspaceId, memberId);
  if (input.availabilityId) {
    const availability = await prisma.availability.findFirst({
      where: { id: input.availabilityId, workspaceId },
    });
    if (!availability) throw badRequest("That departure was not found in this workspace.");
  }
  return prisma.staffTimeEntry.create({
    data: {
      workspaceId,
      memberId,
      workedOn: input.workedOn,
      minutes: input.minutes,
      availabilityId: input.availabilityId ?? null,
      role: input.role ?? null,
      note: input.note ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

/** Sum of worked minutes for `memberId` in the ISO week containing `reference`. */
export async function weeklyWorkedMinutes(workspaceId: string, memberId: string, reference: Date): Promise<number> {
  const day = reference.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() + diffToMonday));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const entries = await prisma.staffTimeEntry.findMany({
    where: { workspaceId, memberId, workedOn: { gte: weekStart, lt: weekEnd } },
    select: { minutes: true },
  });
  return entries.reduce((sum, e) => sum + e.minutes, 0);
}

/* ------------------------------------------------------------------------ */
/* Ratings                                                                  */
/* ------------------------------------------------------------------------ */

export async function listRatings(workspaceId: string, memberId: string) {
  return prisma.guideRating.findMany({ where: { workspaceId, memberId }, orderBy: { createdAt: "desc" } });
}

export async function createRating(
  workspaceId: string,
  memberId: string,
  input: { ratingValue: number; availabilityId?: string; comment?: string; createdById?: string },
) {
  await requireMember(workspaceId, memberId);
  return prisma.guideRating.create({
    data: {
      workspaceId,
      memberId,
      ratingValue: input.ratingValue,
      availabilityId: input.availabilityId ?? null,
      comment: input.comment ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

export async function averageRating(workspaceId: string, memberId: string): Promise<number | null> {
  const agg = await prisma.guideRating.aggregate({
    where: { workspaceId, memberId },
    _avg: { ratingValue: true },
  });
  return agg._avg.ratingValue;
}
