import { TZDate } from "@date-fns/tz";
import type { Tour, TourSchedule } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SLOT_GENERATION_MAX_DAYS } from "@/lib/constants";

/**
 * Slot generation: materialize concrete departure rows (`availabilities`)
 * from a recurring schedule rule, in the workspace's timezone.
 *
 * Guarantees:
 * - DST-correct instants via TZDate (local wall time in tz → UTC instant)
 * - blackout dates (workspace-wide or tour-specific) are skipped
 * - idempotent: unique (tour_id, starts_at) + skipDuplicates — re-running
 *   creates nothing new and never resurrects cancelled slots
 * - future-only: never creates slots in the past
 */

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" of a @db.Date value (stored as UTC midnight). */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type BlackoutRange = { start: string; end: string };

export function computeSlotInstants(input: {
  timezone: string;
  daysOfWeek: number[];
  startTime: string; // "HH:MM"
  fromKey: string; // inclusive, "YYYY-MM-DD"
  toKey: string; // inclusive
  blackouts: BlackoutRange[];
}): Date[] {
  const [hour, minute] = input.startTime.split(":").map(Number);
  const daySet = new Set(input.daysOfWeek);
  const instants: Date[] = [];

  let cursor = Date.parse(`${input.fromKey}T00:00:00Z`);
  const end = Date.parse(`${input.toKey}T00:00:00Z`);

  while (cursor <= end) {
    const day = new Date(cursor);
    const key = dateKey(day);
    // A calendar date's weekday is timezone-independent.
    const weekday = day.getUTCDay();
    const blackedOut = input.blackouts.some((b) => key >= b.start && key <= b.end);

    if (daySet.has(weekday) && !blackedOut) {
      const local = new TZDate(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        hour,
        minute,
        0,
        input.timezone,
      );
      instants.push(new Date(local.getTime()));
    }
    cursor += DAY_MS;
  }

  return instants;
}

/**
 * Materialize future slots for a schedule over the next `days` days.
 * Returns the number of newly created slots.
 */
export async function generateSlotsForSchedule(input: {
  tour: Tour;
  schedule: TourSchedule;
  timezone: string;
  days: number;
}): Promise<number> {
  const { tour, schedule, timezone } = input;
  const days = Math.min(Math.max(input.days, 1), SLOT_GENERATION_MAX_DAYS);

  if (schedule.status !== "active") return 0;

  const now = Date.now();
  // Start a day early and rely on the future-only filter, so timezone
  // boundaries around "today" can't drop a valid slot.
  const windowStart = now - DAY_MS;
  const windowEnd = now + days * DAY_MS;

  const scheduleStart = Date.parse(`${dateKey(schedule.startsOn)}T00:00:00Z`);
  const scheduleEnd = schedule.endsOn
    ? Date.parse(`${dateKey(schedule.endsOn)}T00:00:00Z`)
    : Number.POSITIVE_INFINITY;

  const fromMs = Math.max(windowStart, scheduleStart);
  const toMs = Math.min(windowEnd, scheduleEnd);
  if (fromMs > toMs) return 0;

  const blackoutRows = await prisma.blackoutDate.findMany({
    where: {
      workspaceId: tour.workspaceId,
      OR: [{ tourId: null }, { tourId: tour.id }],
    },
  });
  const blackouts = blackoutRows.map((row) => ({
    start: dateKey(row.startsOn),
    end: dateKey(row.endsOn),
  }));

  const instants = computeSlotInstants({
    timezone,
    daysOfWeek: schedule.daysOfWeek,
    startTime: schedule.startTime,
    fromKey: dateKey(new Date(fromMs)),
    toKey: dateKey(new Date(toMs)),
    blackouts,
  }).filter((instant) => instant.getTime() > now);

  if (instants.length === 0) return 0;

  const durationMs = (schedule.durationMinutes ?? tour.durationMinutes) * 60_000;
  const capacity = schedule.capacity ?? tour.capacity;

  const result = await prisma.availability.createMany({
    data: instants.map((startsAt) => ({
      workspaceId: tour.workspaceId,
      tourId: tour.id,
      scheduleId: schedule.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMs),
      capacity,
    })),
    skipDuplicates: true,
  });

  return result.count;
}
