import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api";
import { generateItineraryPlan, type GenerateItineraryInput } from "./generator";
import type { ItineraryListQuery } from "./types";

/** Same high-entropy URL-safe token approach as Booking.publicToken (lib/bookings/reference.ts) — kept local since the itinerary token has no other relationship to a booking. */
function generatePublicToken(): string {
  return randomBytes(24).toString("base64url");
}

export function buildItineraryListQuery(workspaceId: string, query: ItineraryListQuery) {
  const where: Prisma.ItineraryWhereInput = { workspaceId };
  if (query.status) where.status = query.status;
  if (query.search) {
    const search = query.search.trim();
    if (search.length > 0) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { destination: { contains: search, mode: "insensitive" } },
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

export async function listItineraries(workspaceId: string, query: ItineraryListQuery) {
  const { where, orderBy, skip, take } = buildItineraryListQuery(workspaceId, query);
  const [itineraries, total] = await Promise.all([
    prisma.itinerary.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { _count: { select: { items: true } }, customer: { select: { id: true, name: true } } },
    }),
    prisma.itinerary.count({ where }),
  ]);
  return { itineraries, total };
}

const DETAIL_INCLUDE = {
  days: { orderBy: { dayNumber: "asc" as const }, include: { items: { orderBy: { sortOrder: "asc" as const } } } },
  customer: { select: { id: true, name: true } },
  lead: { select: { id: true, name: true } },
} satisfies Prisma.ItineraryInclude;

export async function requireItinerary(workspaceId: string, itineraryId: string) {
  const itinerary = await prisma.itinerary.findFirst({
    where: { id: itineraryId, workspaceId },
    include: DETAIL_INCLUDE,
  });
  if (!itinerary) throw notFound("Itinerary not found");
  return itinerary;
}

export async function findItineraryByPublicToken(publicToken: string) {
  return prisma.itinerary.findFirst({
    where: { publicToken, status: { not: "archived" } },
    include: { ...DETAIL_INCLUDE, workspace: { select: { name: true, currency: true, timezone: true } } },
  });
}

export type GenerateItineraryOptions = Omit<GenerateItineraryInput, "workspaceId"> & {
  title: string;
  startDate?: Date;
  currency?: string;
  customerId?: string;
  leadId?: string;
  createdById?: string;
};

/** Generates a full day-by-day plan and persists it — Itinerary + ItineraryDay[] + ItineraryItem[] + an initial ItineraryVersion snapshot, all in one transaction. */
export async function generateAndSaveItinerary(workspaceId: string, input: GenerateItineraryOptions) {
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, workspaceId, deletedAt: null } });
    if (!customer) throw badRequest("That customer was not found in this workspace.");
  }
  if (input.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, workspaceId } });
    if (!lead) throw badRequest("That lead was not found in this workspace.");
  }

  const plan = await generateItineraryPlan({
    workspaceId,
    destination: input.destination,
    dayCount: input.dayCount,
    travelerCount: input.travelerCount,
    budgetTier: input.budgetTier,
  });

  return prisma.$transaction(async (tx) => {
    const itinerary = await tx.itinerary.create({
      data: {
        workspaceId,
        title: input.title,
        destination: input.destination ?? null,
        dayCount: input.dayCount,
        startDate: input.startDate ?? null,
        travelerCount: input.travelerCount,
        currency: input.currency ?? "USD",
        customerId: input.customerId ?? null,
        leadId: input.leadId ?? null,
        publicToken: generatePublicToken(),
        createdById: input.createdById ?? null,
      },
    });

    const dayRows = await Promise.all(
      plan.days.map((day) =>
        tx.itineraryDay.create({
          data: { workspaceId, itineraryId: itinerary.id, dayNumber: day.dayNumber, title: day.title },
        }),
      ),
    );
    const dayIdByNumber = new Map(dayRows.map((d) => [d.dayNumber, d.id]));

    let sortOrder = 0;
    for (const item of plan.items) {
      const dayId = dayIdByNumber.get(item.dayNumber);
      if (!dayId) continue;
      await tx.itineraryItem.create({
        data: {
          workspaceId,
          itineraryId: itinerary.id,
          itineraryDayId: dayId,
          type: item.type,
          title: item.title,
          description: item.description ?? null,
          startTime: item.startTime ?? null,
          tourId: item.tourId ?? null,
          vendorId: item.vendorId ?? null,
          costCents: item.costCents,
          priceCents: item.priceCents,
          sortOrder: sortOrder++,
        },
      });
    }

    await tx.itineraryVersion.create({
      data: {
        workspaceId,
        itineraryId: itinerary.id,
        versionNumber: 1,
        snapshot: plan as unknown as Prisma.InputJsonValue,
        note: "Generated",
        createdById: input.createdById ?? null,
      },
    });

    return requireItineraryTx(tx, workspaceId, itinerary.id);
  });
}

async function requireItineraryTx(tx: Prisma.TransactionClient, workspaceId: string, itineraryId: string) {
  const itinerary = await tx.itinerary.findFirst({ where: { id: itineraryId, workspaceId }, include: DETAIL_INCLUDE });
  if (!itinerary) throw notFound("Itinerary not found");
  return itinerary;
}

export type UpdateItineraryInput = {
  title?: string;
  destination?: string;
  startDate?: Date | null;
  travelerCount?: number | null;
  status?: "draft" | "shared" | "confirmed" | "archived";
  customerId?: string | null;
  leadId?: string | null;
};

export async function updateItinerary(workspaceId: string, itineraryId: string, input: UpdateItineraryInput) {
  await requireItinerary(workspaceId, itineraryId);
  await prisma.itinerary.update({
    where: { id: itineraryId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.destination !== undefined ? { destination: input.destination } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.travelerCount !== undefined ? { travelerCount: input.travelerCount } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
      ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
    },
  });
  return requireItinerary(workspaceId, itineraryId);
}

export async function updateItineraryDay(
  workspaceId: string,
  itineraryId: string,
  dayId: string,
  input: { title?: string; date?: Date | null; notes?: string },
) {
  const day = await prisma.itineraryDay.findFirst({ where: { id: dayId, workspaceId, itineraryId } });
  if (!day) throw notFound("Itinerary day not found");
  return prisma.itineraryDay.update({
    where: { id: dayId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
}

export type CreateItineraryItemInput = {
  itineraryDayId: string;
  type?: "accommodation" | "meal" | "activity" | "transfer" | "flight" | "guide" | "vehicle" | "other";
  title: string;
  description?: string;
  startTime?: string;
  tourId?: string;
  vendorId?: string;
  costCents?: number;
  priceCents?: number;
};

export async function createItineraryItem(workspaceId: string, itineraryId: string, input: CreateItineraryItemInput) {
  const day = await prisma.itineraryDay.findFirst({ where: { id: input.itineraryDayId, workspaceId, itineraryId } });
  if (!day) throw badRequest("That day was not found on this itinerary.");

  const maxSortOrder = await prisma.itineraryItem.aggregate({
    where: { workspaceId, itineraryDayId: input.itineraryDayId },
    _max: { sortOrder: true },
  });

  return prisma.itineraryItem.create({
    data: {
      workspaceId,
      itineraryId,
      itineraryDayId: input.itineraryDayId,
      type: input.type ?? "other",
      title: input.title,
      description: input.description ?? null,
      startTime: input.startTime ?? null,
      tourId: input.tourId ?? null,
      vendorId: input.vendorId ?? null,
      costCents: input.costCents ?? 0,
      priceCents: input.priceCents ?? 0,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });
}

export type UpdateItineraryItemInput = {
  type?: "accommodation" | "meal" | "activity" | "transfer" | "flight" | "guide" | "vehicle" | "other";
  title?: string;
  description?: string;
  startTime?: string | null;
  tourId?: string | null;
  vendorId?: string | null;
  costCents?: number;
  priceCents?: number;
};

export async function requireItineraryItem(workspaceId: string, itineraryId: string, itemId: string) {
  const item = await prisma.itineraryItem.findFirst({ where: { id: itemId, workspaceId, itineraryId } });
  if (!item) throw notFound("Itinerary item not found");
  return item;
}

export async function updateItineraryItem(
  workspaceId: string,
  itineraryId: string,
  itemId: string,
  input: UpdateItineraryItemInput,
) {
  await requireItineraryItem(workspaceId, itineraryId, itemId);
  return prisma.itineraryItem.update({
    where: { id: itemId },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
      ...(input.tourId !== undefined ? { tourId: input.tourId } : {}),
      ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
      ...(input.costCents !== undefined ? { costCents: input.costCents } : {}),
      ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
    },
  });
}

export async function deleteItineraryItem(workspaceId: string, itineraryId: string, itemId: string) {
  await requireItineraryItem(workspaceId, itineraryId, itemId);
  await prisma.itineraryItem.delete({ where: { id: itemId } });
}

/**
 * Move an item up or down within its day's sort order — the accessible,
 * button-based alternative to drag-and-drop reordering (see
 * components/itineraries). Swaps `sortOrder` with the adjacent item in the
 * same day.
 */
export async function reorderItineraryItem(
  workspaceId: string,
  itineraryId: string,
  itemId: string,
  direction: "up" | "down",
) {
  const item = await requireItineraryItem(workspaceId, itineraryId, itemId);
  const siblings = await prisma.itineraryItem.findMany({
    where: { workspaceId, itineraryDayId: item.itineraryDayId },
    orderBy: { sortOrder: "asc" },
  });
  const index = siblings.findIndex((s) => s.id === itemId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) return item;

  const other = siblings[swapIndex];
  await prisma.$transaction([
    prisma.itineraryItem.update({ where: { id: item.id }, data: { sortOrder: other.sortOrder } }),
    prisma.itineraryItem.update({ where: { id: other.id }, data: { sortOrder: item.sortOrder } }),
  ]);
  return item;
}

/** Snapshots the full current itinerary (days + items) as the next version — "Version History". */
export async function saveItineraryVersion(workspaceId: string, itineraryId: string, note: string | undefined, actorUserId: string | null) {
  const itinerary = await requireItinerary(workspaceId, itineraryId);

  const lastVersion = await prisma.itineraryVersion.aggregate({
    where: { workspaceId, itineraryId },
    _max: { versionNumber: true },
  });
  const versionNumber = (lastVersion._max.versionNumber ?? 0) + 1;

  return prisma.itineraryVersion.create({
    data: {
      workspaceId,
      itineraryId,
      versionNumber,
      snapshot: itinerary as unknown as Prisma.InputJsonValue,
      note: note ?? null,
      createdById: actorUserId,
    },
  });
}

export async function listItineraryVersions(workspaceId: string, itineraryId: string) {
  return prisma.itineraryVersion.findMany({
    where: { workspaceId, itineraryId },
    orderBy: { versionNumber: "desc" },
  });
}
