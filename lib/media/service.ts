import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { createPresignedPutUrl } from "@/lib/storage/s3";
import { completeUploadSchema, uploadIntentSchema } from "@/lib/media/schema";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function cleanFileName(fileName: string) {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "image";
}

export async function createMediaUploadIntent({
  workspaceId,
  userId,
  input,
}: {
  workspaceId: string;
  userId: string;
  input: unknown;
}) {
  const data = uploadIntentSchema.parse(input);
  const extension = EXTENSIONS[data.contentType];
  const id = crypto.randomUUID();
  const storageKey = `workspaces/${workspaceId}/media/${id}.${extension}`;
  const signed = createPresignedPutUrl({ key: storageKey, contentType: data.contentType });

  const asset = await prisma.workspaceMediaAsset.create({
    data: {
      workspaceId,
      storageKey,
      url: signed.publicUrl,
      fileName: cleanFileName(data.fileName),
      contentType: data.contentType,
      byteSize: data.byteSize,
      altText: data.altText,
      uploadedById: userId,
    },
  });

  return {
    asset,
    upload: {
      url: signed.uploadUrl,
      method: "PUT",
      headers: { "Content-Type": data.contentType },
      expiresAt: signed.expiresAt.toISOString(),
    },
  };
}

export async function completeMediaUpload({
  workspaceId,
  assetId,
  input,
}: {
  workspaceId: string;
  assetId: string;
  input: unknown;
}) {
  const data = completeUploadSchema.parse(input);
  return prisma.workspaceMediaAsset.update({
    where: { workspaceId_id: { workspaceId, id: assetId } },
    data: {
      status: "uploaded",
      width: data.width ?? null,
      height: data.height ?? null,
      focalX: data.focalX,
      focalY: data.focalY,
      uploadedAt: new Date(),
    },
  });
}

export async function listMediaAssets(workspaceId: string) {
  return prisma.workspaceMediaAsset.findMany({
    where: { workspaceId, status: { not: "deleted" } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
