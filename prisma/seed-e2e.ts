/**
 * Deterministic fixture for the Playwright critical-flow test only.
 * Never invoked by `db:seed` / production — only by `scripts/test-e2e.sh`
 * against `tripistic_test`. Idempotent (upserts), so re-running is safe.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  E2E_CUSTOM_DOMAIN,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_TOUR_SLUG,
  E2E_WAIVER_TOUR_SLUG,
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

  // Phase 8 made feature access depend on an entitled subscription, and this
  // fixture writes rows directly instead of going through
  // `POST /api/workspaces`, which is what normally creates one. Without it the
  // seeded workspace has no plan and every gated feature — waivers, guides,
  // custom domains — correctly answers 402, which is a fixture gap rather than
  // a product defect. Seeded on `enterprise` so the fixture exercises the
  // product rather than the paywall.
  const plan = await prisma.plan.upsert({
    where: { slug: "enterprise" },
    create: {
      name: "Enterprise",
      slug: "enterprise",
      priceMonthly: 0,
      priceYearly: 0,
      currency: "USD",
      limits: { users: -1, active_tours: -1, custom_domains: -1 },
    },
    update: {},
  });

  const existingSubscription = await prisma.subscription.findFirst({
    where: { workspaceId: workspace.id },
  });
  if (!existingSubscription) {
    await prisma.subscription.create({
      data: { workspaceId: workspace.id, planId: plan.id, status: "active" },
    });
  }

  await prisma.customDomain.upsert({
    where: { hostname: E2E_CUSTOM_DOMAIN },
    create: {
      workspaceId: workspace.id,
      hostname: E2E_CUSTOM_DOMAIN,
      status: "active",
      verificationToken: "tripistic-domain-verification=e2e-custom-domain",
      expectedCname: "cname.tripistic.test",
      provider: "manual",
      providerStatus: "active",
      providerSslStatus: "active",
      verifiedAt: new Date(),
      sslIssuedAt: new Date(),
      lastCheckedAt: new Date(),
      lastCheckMessage: "E2E custom domain fixture.",
    },
    update: {
      workspaceId: workspace.id,
      status: "active",
      provider: "manual",
      providerStatus: "active",
      providerSslStatus: "active",
      verifiedAt: new Date(),
      sslIssuedAt: new Date(),
      lastCheckedAt: new Date(),
      lastCheckMessage: "E2E custom domain fixture.",
    },
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

  // A second, waiver-required tour + a published waiver version, for the
  // Playwright waiver-signing spec — kept separate from the primary tour
  // above so that spec's selectors never interact with the base
  // booking-flow spec's assumptions.
  const existingWaiverTour = await prisma.tour.findFirst({
    where: { workspaceId: workspace.id, slug: E2E_WAIVER_TOUR_SLUG },
  });
  const waiverTour = existingWaiverTour
    ? await prisma.tour.update({
        where: { id: existingWaiverTour.id },
        data: { status: "active", visibility: "public", deletedAt: null, basePrice: 0, waiverRequired: true },
      })
    : await prisma.tour.create({
        data: {
          workspaceId: workspace.id,
          title: "Canyon Rappel Tour",
          slug: E2E_WAIVER_TOUR_SLUG,
          description: "A guided rappel down a slot canyon — requires a signed waiver.",
          durationMinutes: 180,
          capacity: 4,
          basePrice: 0,
          currency: "USD",
          status: "active",
          visibility: "public",
          waiverRequired: true,
        },
      });

  const waiverStartsAt = new Date(Date.now() + 7 * 86_400_000);
  waiverStartsAt.setUTCHours(17, 0, 0, 0);
  const existingWaiverSlot = await prisma.availability.findFirst({
    where: { tourId: waiverTour.id, status: "scheduled", startsAt: { gt: new Date() } },
  });
  if (!existingWaiverSlot) {
    await prisma.availability.create({
      data: {
        workspaceId: workspace.id,
        tourId: waiverTour.id,
        startsAt: waiverStartsAt,
        endsAt: new Date(waiverStartsAt.getTime() + waiverTour.durationMinutes * 60_000),
        capacity: 4,
        bookedCount: 0,
        status: "scheduled",
      },
    });
  }

  const waiverTemplate = await prisma.waiverTemplate.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id },
    update: {},
  });
  const existingVersion = await prisma.waiverVersion.findFirst({ where: { templateId: waiverTemplate.id } });
  if (!existingVersion) {
    await prisma.waiverVersion.create({
      data: {
        workspaceId: workspace.id,
        templateId: waiverTemplate.id,
        versionNumber: 1,
        title: "Liability Waiver",
        bodyText: "I acknowledge the risks of this activity, including but not limited to injury, and release the operator from liability to the extent permitted by law.",
      },
    });
  }

  console.log(`✓ e2e fixture ready — workspace "${E2E_WORKSPACE_SLUG}", tour "${E2E_TOUR_SLUG}", waiver tour "${E2E_WAIVER_TOUR_SLUG}"`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
