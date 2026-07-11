import type { WaiverSignature, WaiverVersion } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { MAX_SIGNATURE_IMAGE_LENGTH } from "@/lib/constants";

/** One per workspace — a true singleton, created lazily on first write. */
export async function getOrCreateWaiverTemplate(workspaceId: string) {
  const existing = await prisma.waiverTemplate.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  return prisma.waiverTemplate.create({ data: { workspaceId } });
}

/** The current (highest-versionNumber) version, or `null` if nothing has been published yet. */
export async function getCurrentWaiverVersion(workspaceId: string): Promise<WaiverVersion | null> {
  const template = await prisma.waiverTemplate.findUnique({ where: { workspaceId } });
  if (!template) return null;
  return prisma.waiverVersion.findFirst({
    where: { workspaceId, templateId: template.id },
    orderBy: { versionNumber: "desc" },
  });
}

export async function listWaiverVersions(workspaceId: string): Promise<WaiverVersion[]> {
  const template = await prisma.waiverTemplate.findUnique({ where: { workspaceId } });
  if (!template) return [];
  return prisma.waiverVersion.findMany({
    where: { workspaceId, templateId: template.id },
    orderBy: { versionNumber: "desc" },
  });
}

/**
 * Publishes a new immutable version — never mutates a prior one, no update
 * route exists for WaiverVersion at all. `versionNumber` is 1-based and
 * derived from the current max, not caller-supplied.
 */
export async function publishWaiverVersion(input: {
  workspaceId: string;
  title: string;
  bodyText: string;
  createdById?: string | null;
}): Promise<WaiverVersion> {
  const template = await getOrCreateWaiverTemplate(input.workspaceId);
  const latest = await prisma.waiverVersion.findFirst({
    where: { workspaceId: input.workspaceId, templateId: template.id },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const versionNumber = (latest?.versionNumber ?? 0) + 1;

  const version = await prisma.waiverVersion.create({
    data: {
      workspaceId: input.workspaceId,
      templateId: template.id,
      versionNumber,
      title: input.title,
      bodyText: input.bodyText,
      createdById: input.createdById ?? null,
    },
  });

  await recordAuditEvent({
    action: "waiver_version_published",
    workspaceId: input.workspaceId,
    userId: input.createdById ?? null,
    entityType: "waiver_version",
    entityId: version.id,
    metadata: { versionNumber },
  });

  return version;
}

function isValidSignatureImage(value: string): boolean {
  return value.startsWith("data:image/png;base64,") && value.length > 0 && value.length <= MAX_SIGNATURE_IMAGE_LENGTH;
}

export type SignWaiverInput = {
  workspaceId: string;
  bookingId: string;
  participantId: string;
  signerName: string;
  signatureImage: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type SignWaiverResult = { signature: WaiverSignature; alreadySigned: boolean };

/**
 * Idempotent: a participant who has already signed gets their existing
 * record back (200-shaped success), never a 409 — a guest re-opening the
 * confirmation page or double-submitting should never see an error for
 * something that already succeeded.
 */
export async function signWaiver(input: SignWaiverInput): Promise<SignWaiverResult> {
  if (!isValidSignatureImage(input.signatureImage)) {
    throw badRequest("Invalid signature image.");
  }
  if (!input.signerName.trim()) {
    throw badRequest("A name is required to sign.");
  }

  const participant = await prisma.bookingParticipant.findFirst({
    where: { id: input.participantId, workspaceId: input.workspaceId, bookingId: input.bookingId },
    include: { waiverSignature: true },
  });
  if (!participant) throw notFound("Participant not found on this booking.");

  if (participant.waiverSignature) {
    return { signature: participant.waiverSignature, alreadySigned: true };
  }

  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, workspaceId: input.workspaceId },
    include: { tour: { select: { waiverRequired: true } } },
  });
  if (!booking) throw notFound("Booking not found.");
  if (!booking.tour.waiverRequired) {
    throw badRequest("This tour does not require a signed waiver.");
  }

  const version = await getCurrentWaiverVersion(input.workspaceId);
  if (!version) throw badRequest("No waiver has been published for this workspace yet.");

  const signature = await prisma.waiverSignature.create({
    data: {
      workspaceId: input.workspaceId,
      bookingId: input.bookingId,
      participantId: input.participantId,
      waiverVersionId: version.id,
      signerName: input.signerName.trim(),
      signatureImage: input.signatureImage,
      signedAt: new Date(),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });

  await recordAuditEvent({
    action: "waiver_signed",
    workspaceId: input.workspaceId,
    userId: null,
    entityType: "waiver_signature",
    entityId: signature.id,
    metadata: { bookingId: input.bookingId, participantId: input.participantId },
  });

  return { signature, alreadySigned: false };
}

export type ParticipantWaiverStatus = {
  participantId: string;
  firstName: string;
  lastName: string;
  signed: boolean;
  signedAt: string | null;
  signerName: string | null;
};

/**
 * Per-participant signed status for a booking — used by both the operator
 * booking-detail page (gated by `canViewWaiverSignatures`) and the public
 * confirmation page (gated by possession of the booking's `publicToken`
 * instead, same trust model as the rest of the public booking API).
 */
export async function getWaiverStatusForBooking(workspaceId: string, bookingId: string): Promise<ParticipantWaiverStatus[]> {
  const participants = await prisma.bookingParticipant.findMany({
    where: { workspaceId, bookingId },
    include: { waiverSignature: { select: { signedAt: true, signerName: true } } },
  });
  return participants.map((participant) => ({
    participantId: participant.id,
    firstName: participant.firstName,
    lastName: participant.lastName,
    signed: participant.waiverSignature != null,
    signedAt: participant.waiverSignature?.signedAt.toISOString() ?? null,
    signerName: participant.waiverSignature?.signerName ?? null,
  }));
}
