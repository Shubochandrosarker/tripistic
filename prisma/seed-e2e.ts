/**
 * Deterministic fixture for the Playwright critical-flow test only.
 * Never invoked by `db:seed` / production — only by `scripts/test-e2e.sh`
 * against `tripistic_test`. Idempotent (upserts), so re-running is safe.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_TOUR_SLUG,
  E2E_WORKSPACE_SLUG,
} from "./e2e-fixture-constants";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash(E2E_OWNER_PASSWORD, 10);

  const owner = await prisma.user.upsert({
    where: { email: E2E_OWNER_EMAIL },
    create: {
      email: E2E_OWNER_EMAIL,
      name: "E2E Owner",
      passwordHash,
      emailVerifiedAt: new Date(),
    },
    update: { passwordHash },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: E2E_WORKSPACE_SLUG },
    create: {
      name: "E2E Tours",
      slug: E2E_WORKSPACE_SLUG,
      ownerId: owner.id,
      timezone: "America/Phoenix",
      currency: "USD",
      status: "active",
    },
    update: { status: "active", deletedAt: null },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    create: { workspaceId: workspace.id, userId: owner.id, role: "workspace_owner" },
    update: { role: "workspace_owner", status: "active" },
  });

  // basePrice/addon price are deliberately 0 — this sandbox has no real
  // Stripe test-mode credentials, so a non-zero total (which would route
  // the booking through a real Stripe Checkout Session) can't be driven end
  // to end by Playwright here. A free booking still exercises the full
  // form/reservation/confirmation/dashboard/cancellation UI; the paid
  // Stripe flow itself is covered by the mocked-Stripe-client and
  // real-signed-webhook integration tests instead (see docs/17 §12).
  const existingTour = await prisma.tour.findFirst({
    where: { workspaceId: workspace.id, slug: E2E_TOUR_SLUG },
  });
  const tour = existingTour
    ? await prisma.tour.update({
        where: { id: existingTour.id },
        data: { status: "active", visibility: "public", deletedAt: null, basePrice: 0 },
      })
    : await prisma.tour.create({
        data: {
          workspaceId: workspace.id,
          title: "Desert Jeep Tour",
          slug: E2E_TOUR_SLUG,
          description: "A guided jeep tour through the desert backcountry.",
          durationMinutes: 120,
          capacity: 4,
          basePrice: 0,
          currency: "USD",
          status: "active",
          visibility: "public",
          location: "Sedona, AZ",
          meetingPoint: "Main visitor center, north entrance",
          cancellationPolicy: "Free cancellation up to 24 hours before departure.",
        },
      });

  const existingAddon = await prisma.tourAddon.findFirst({
    where: { tourId: tour.id, name: "Water & Snacks" },
  });
  if (existingAddon) {
    await prisma.tourAddon.update({ where: { id: existingAddon.id }, data: { price: 0 } });
  } else {
    await prisma.tourAddon.create({
      data: { workspaceId: workspace.id, tourId: tour.id, name: "Water & Snacks", price: 0 },
    });
  }

  // A fresh future departure every run so the flow never hits a stale/past slot.
  const startsAt = new Date(Date.now() + 7 * 86_400_000);
  startsAt.setUTCHours(16, 0, 0, 0); // 09:00 America/Phoenix (UTC-7, no DST)
  const existingSlot = await prisma.availability.findFirst({
    where: { tourId: tour.id, status: "scheduled", startsAt: { gt: new Date() } },
  });
  if (!existingSlot) {
    await prisma.availability.create({
      data: {
        workspaceId: workspace.id,
        tourId: tour.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + tour.durationMinutes * 60_000),
        capacity: 4,
        bookedCount: 0,
        status: "scheduled",
      },
    });
  }

  console.log(`✓ e2e fixture ready — workspace "${E2E_WORKSPACE_SLUG}", tour "${E2E_TOUR_SLUG}"`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
