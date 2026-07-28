import { Prisma } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import {
  defaultStorefrontDraft,
  validateStorefrontDraft,
  type StorefrontDraft,
} from "@/lib/storefront/schema";

function asJson(value: StorefrontDraft): Prisma.InputJsonObject {
  return value as unknown as Prisma.InputJsonObject;
}

export async function getStorefrontForWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    select: { id: true, name: true, currency: true },
  });
  if (!workspace) return null;

  const storefront = await prisma.workspaceStorefront.findUnique({
    where: { workspaceId },
    include: {
      revisions: { orderBy: { versionNumber: "desc" }, take: 10 },
    },
  });
  const fallbackDraft = defaultStorefrontDraft(workspace);

  return {
    storefront,
    draft: storefront ? validateStorefrontDraft(storefront.draft) : fallbackDraft,
    published: storefront?.published ? validateStorefrontDraft(storefront.published) : null,
    defaultDraft: fallbackDraft,
  };
}

export async function getPublishedStorefrontBySlug(slug: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug, status: "active", deletedAt: null },
    include: {
      whiteLabel: true,
      storefront: true,
    },
  });
  if (!workspace) return null;

  const published =
    workspace.storefront?.status === "published" && workspace.storefront.published
      ? validateStorefrontDraft(workspace.storefront.published)
      : defaultStorefrontDraft(workspace);

  return { workspace, published };
}

async function upsertStorefrontDraft(
  tx: Db,
  workspaceId: string,
  userId: string,
  draft: StorefrontDraft,
) {
  return tx.workspaceStorefront.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      draft: asJson(draft),
      updatedById: userId,
    },
    update: {
      draft: asJson(draft),
      updatedById: userId,
      status: "draft",
    },
  });
}

export async function saveStorefrontDraft({
  workspaceId,
  userId,
  input,
}: {
  workspaceId: string;
  userId: string;
  input: unknown;
}) {
  const draft = validateStorefrontDraft(input);
  return prisma.$transaction((tx) => upsertStorefrontDraft(tx, workspaceId, userId, draft));
}

export async function publishStorefront({
  workspaceId,
  userId,
  input,
}: {
  workspaceId: string;
  userId: string;
  input?: unknown;
}) {
  const current = await getStorefrontForWorkspace(workspaceId);
  if (!current) return null;
  const draft = input ? validateStorefrontDraft(input) : current.draft;

  return prisma.$transaction(async (tx) => {
    const storefront = await upsertStorefrontDraft(tx, workspaceId, userId, draft);
    const versionNumber = storefront.publishedVersion + 1;
    const published = await tx.workspaceStorefront.update({
      where: { id: storefront.id },
      data: {
        status: "published",
        published: asJson(draft),
        publishedVersion: versionNumber,
        publishedAt: new Date(),
        updatedById: userId,
      },
    });

    await tx.workspaceStorefrontRevision.create({
      data: {
        workspaceId,
        storefrontId: storefront.id,
        versionNumber,
        snapshot: asJson(draft),
        note: "Published from dashboard builder",
        createdById: userId,
      },
    });

    return published;
  });
}
