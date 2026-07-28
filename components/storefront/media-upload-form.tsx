"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/media/schema";

type UploadIntentResponse = {
  asset: { id: string };
  upload: {
    url: string;
    method: "PUT";
    headers: Record<string, string>;
  };
  error?: string;
};

async function imageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith("image/")) return {};
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({});
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function MediaUploadForm({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const altText = String(form.get("altText") ?? "");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose an image file.");
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      setError("Use JPG, PNG, WebP, or AVIF.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be 10 MB or smaller.");
      return;
    }

    setBusy(true);
    try {
      const intentResponse = await fetch(`/api/workspaces/${workspaceId}/media/upload-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          byteSize: file.size,
          altText,
        }),
      });
      const intent = (await intentResponse.json().catch(() => null)) as UploadIntentResponse | null;
      if (!intentResponse.ok || !intent?.upload) {
        throw new Error(intent?.error ?? "Could not prepare upload.");
      }

      const uploadResponse = await fetch(intent.upload.url, {
        method: intent.upload.method,
        headers: intent.upload.headers,
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Storage upload failed.");

      const dimensions = await imageDimensions(file);
      const completeResponse = await fetch(
        `/api/workspaces/${workspaceId}/media/${intent.asset.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dimensions),
        },
      );
      const completeBody = (await completeResponse.json().catch(() => null)) as { error?: string } | null;
      if (!completeResponse.ok) throw new Error(completeBody?.error ?? "Could not finish upload.");

      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
      <Field label="Image" htmlFor="media-file">
        <Input id="media-file" name="file" type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} disabled={!canManage || busy} required />
      </Field>
      <Field label="Alt text" htmlFor="media-alt">
        <Input id="media-alt" name="altText" minLength={3} maxLength={240} disabled={!canManage || busy} required />
      </Field>
      <div className="flex items-end">
        <Button type="submit" disabled={!canManage || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
          Upload
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400 lg:col-span-3">{error}</p> : null}
    </form>
  );
}
