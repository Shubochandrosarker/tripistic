import { prisma } from "@/lib/db";
import { notFound } from "@/lib/api";
import { STAFF_WEEKLY_OVERTIME_THRESHOLD_MINUTES } from "@/lib/constants";
import { hasApprovedTimeOffConflict, weeklyWorkedMinutes } from "./service";

export type MatchCandidate = {
  memberId: string;
  name: string;
  score: number;
  reasons: string[];
  languages: string[];
  ratingAvg: number | null;
  completedAssignments: number;
  weeklyMinutes: number;
};

const LANGUAGE_WEIGHT = 40;
const RATING_WEIGHT = 25;
const EXPERIENCE_WEIGHT = 20;
const OVERTIME_WEIGHT = 15;
const EXPERIENCE_CAP = 20;

/**
 * Rule-based recommendation engine for "best guide/driver for this
 * departure" (docs Phase 6 spec: AI Guide Matching). Scored on the signals
 * this app actually has data for — language match, availability (hard
 * exclusion, not a score penalty), experience (past assignment count),
 * rating, and overtime load. `distance` is deliberately not scored: there
 * is no staff geolocation/home-address data anywhere in this schema, and
 * inventing a number would violate the "never invented numbers" principle
 * the rest of the AI-flavored features in this codebase follow (see
 * app/dashboard/ai-growth).
 */
export async function matchStaffForAvailability(
  workspaceId: string,
  availabilityId: string,
  role: "guide" | "driver",
  requiredLanguages: string[] = [],
  limit = 5,
): Promise<MatchCandidate[]> {
  const availability = await prisma.availability.findFirst({
    where: { id: availabilityId, workspaceId },
    select: { id: true, startsAt: true, endsAt: true, guideId: true, driverId: true },
  });
  if (!availability) throw notFound("Departure not found");

  const kindFilter = role === "guide" ? (["guide", "both"] as const) : (["driver", "both"] as const);

  const candidates = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      status: "active",
      role: { not: "viewer" },
      guideProfile: { kind: { in: [...kindFilter] }, active: true },
    },
    include: {
      user: { select: { name: true } },
      guideProfile: true,
    },
  });

  const results: MatchCandidate[] = [];

  for (const candidate of candidates) {
    const profile = candidate.guideProfile;
    if (!profile) continue;

    const timeOffConflict = await hasApprovedTimeOffConflict(
      workspaceId,
      candidate.id,
      availability.startsAt,
      availability.endsAt,
    );
    if (timeOffConflict) continue;

    const doubleBooked = await prisma.availability.findFirst({
      where: {
        workspaceId,
        id: { not: availability.id },
        startsAt: { lt: availability.endsAt },
        endsAt: { gt: availability.startsAt },
        OR: [{ guideId: candidate.id }, { driverId: candidate.id }],
      },
      select: { id: true },
    });
    if (doubleBooked) continue;

    const reasons: string[] = [];
    let score = 0;

    if (requiredLanguages.length > 0) {
      const matched = requiredLanguages.filter((lang) =>
        profile.languages.some((l) => l.toLowerCase() === lang.toLowerCase()),
      );
      const languageScore = (matched.length / requiredLanguages.length) * LANGUAGE_WEIGHT;
      score += languageScore;
      reasons.push(
        matched.length === requiredLanguages.length
          ? `Speaks all required languages (${matched.join(", ")})`
          : matched.length > 0
            ? `Speaks ${matched.length}/${requiredLanguages.length} required languages`
            : "Does not speak the required language(s)",
      );
    } else {
      score += LANGUAGE_WEIGHT;
    }

    const ratingAgg = await prisma.guideRating.aggregate({
      where: { workspaceId, memberId: candidate.id },
      _avg: { ratingValue: true },
      _count: true,
    });
    const ratingAvg = ratingAgg._avg.ratingValue;
    if (ratingAvg !== null) {
      score += (ratingAvg / 5) * RATING_WEIGHT;
      reasons.push(`${ratingAvg.toFixed(1)}★ average (${ratingAgg._count} rating${ratingAgg._count === 1 ? "" : "s"})`);
    } else {
      score += RATING_WEIGHT * 0.6;
      reasons.push("No ratings on file yet");
    }

    const completedAssignments = await prisma.availability.count({
      where: {
        workspaceId,
        startsAt: { lt: new Date() },
        OR: [{ guideId: candidate.id }, { driverId: candidate.id }],
      },
    });
    score += (Math.min(completedAssignments, EXPERIENCE_CAP) / EXPERIENCE_CAP) * EXPERIENCE_WEIGHT;
    reasons.push(`${completedAssignments} past assignment${completedAssignments === 1 ? "" : "s"}`);

    const weeklyMinutes = await weeklyWorkedMinutes(workspaceId, candidate.id, availability.startsAt);
    if (weeklyMinutes >= STAFF_WEEKLY_OVERTIME_THRESHOLD_MINUTES) {
      reasons.push(`Already at ${(weeklyMinutes / 60).toFixed(1)}h this week — overtime risk`);
    } else {
      const overtimeScore = (1 - weeklyMinutes / STAFF_WEEKLY_OVERTIME_THRESHOLD_MINUTES) * OVERTIME_WEIGHT;
      score += overtimeScore;
    }

    results.push({
      memberId: candidate.id,
      name: candidate.user.name,
      score: Math.round(score),
      reasons,
      languages: profile.languages,
      ratingAvg,
      completedAssignments,
      weeklyMinutes,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
