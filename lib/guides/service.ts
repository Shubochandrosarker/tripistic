import { prisma, type Db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api";

/**
 * Eligibility check for `Availability.guideId` — the target must be an
 * active member of this exact workspace and not a `viewer` (docs/01 frames
 * viewer as an external, read-only party; never tour-facing). Deliberately
 * not restricted to `role: guide` — an owner or staff member who
 * personally leads trips (the "Sofia — solo guide" persona) is a valid
 * assignment target too.
 */
export async function requireAssignableMember(workspaceId: string, memberId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId, status: "active" },
  });
  if (!member) throw badRequest("That member is not an active member of this workspace.");
  if (member.role === "viewer") throw badRequest("A viewer cannot be assigned as a guide.");
  return member;
}

async function requireMember(workspaceId: string, memberId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
  if (!member) throw notFound("Member not found");
  return member;
}

/**
 * Clears `guideId` on every availability this member is assigned to.
 * Called from member removal, inside the same transaction as the delete —
 * `WorkspaceMember` rows are genuinely hard-deleted in this app (no
 * `deletedAt`) and `Availability.guide` is `onDelete: Restrict` (a
 * composite FK can't `SetNull` a required `workspace_id` column), so this
 * explicit clear is what keeps removal from ever failing on a former
 * guide. Returns the count cleared for the caller's audit metadata rather
 * than writing a separate audit row per availability.
 */
export async function clearGuideAssignments(tx: Db, workspaceId: string, memberId: string): Promise<number> {
  const result = await tx.availability.updateMany({
    where: { workspaceId, guideId: memberId },
    data: { guideId: null },
  });
  return result.count;
}

/** Members + their guide profile (if any), for the Guides management page. */
export async function listGuides(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId, status: "active" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      guideProfile: true,
    },
    orderBy: { joinedAt: "asc" },
  });
}

export type UpsertGuideProfileInput = {
  certifications?: string[];
  notes?: string | null;
  /** Phase 6 (extended) — workforce fields, all optional so existing callers (certifications/notes only) are unaffected. */
  kind?: "guide" | "driver" | "both";
  languages?: string[];
  skills?: string[];
  employmentType?: "employee" | "freelancer" | "contractor";
  phone?: string | null;
  hourlyRateCents?: number | null;
  active?: boolean;
};

/** Created lazily (upsert) the first time an operator records certifications/notes for a member. */
export async function upsertGuideProfile(
  workspaceId: string,
  memberId: string,
  data: UpsertGuideProfileInput,
) {
  await requireMember(workspaceId, memberId);
  return prisma.guideProfile.upsert({
    where: { workspaceId_memberId: { workspaceId, memberId } },
    create: {
      workspaceId,
      memberId,
      certifications: data.certifications ?? [],
      notes: data.notes ?? null,
      kind: data.kind ?? "guide",
      languages: data.languages ?? [],
      skills: data.skills ?? [],
      employmentType: data.employmentType ?? "employee",
      phone: data.phone ?? null,
      hourlyRateCents: data.hourlyRateCents ?? null,
      active: data.active ?? true,
    },
    update: {
      ...(data.certifications !== undefined ? { certifications: data.certifications } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.kind !== undefined ? { kind: data.kind } : {}),
      ...(data.languages !== undefined ? { languages: data.languages } : {}),
      ...(data.skills !== undefined ? { skills: data.skills } : {}),
      ...(data.employmentType !== undefined ? { employmentType: data.employmentType } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.hourlyRateCents !== undefined ? { hourlyRateCents: data.hourlyRateCents } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
}
