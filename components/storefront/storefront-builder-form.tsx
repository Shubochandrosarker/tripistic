"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, Globe2, Save } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import type { StorefrontDraft } from "@/lib/storefront/schema";

type MediaOption = {
  id: string;
  url: string;
  altText: string;
  status: string;
};

function selectedUrl(form: FormData, key: string) {
  const value = String(form.get(key) ?? "");
  return value || "";
}

export function StorefrontBuilderForm({
  workspaceId,
  workspaceSlug,
  draft,
  media,
  canManage,
}: {
  workspaceId: string;
  workspaceSlug: string;
  draft: StorefrontDraft;
  media: MediaOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const uploadedMedia = media.filter((asset) => asset.status === "uploaded");
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function payloadFromForm(form: HTMLFormElement): StorefrontDraft {
    const data = new FormData(form);
    return {
      brand: {
        brandName: String(data.get("brandName") ?? ""),
        logoUrl: selectedUrl(data, "logoUrl") || null,
        faviconUrl: selectedUrl(data, "faviconUrl") || null,
        primaryColor: String(data.get("primaryColor") ?? "#0f766e"),
        secondaryColor: String(data.get("secondaryColor") ?? "#0f172a"),
        accentColor: String(data.get("accentColor") ?? "#f59e0b"),
        surfaceColor: String(data.get("surfaceColor") ?? "#ffffff"),
        textColor: String(data.get("textColor") ?? "#111827"),
        typography: String(data.get("typography") ?? "system") as StorefrontDraft["brand"]["typography"],
      },
      hero: {
        eyebrow: String(data.get("heroEyebrow") ?? ""),
        title: String(data.get("heroTitle") ?? ""),
        subtitle: String(data.get("heroSubtitle") ?? ""),
        imageUrl: selectedUrl(data, "heroImageUrl") || null,
        primaryCta: String(data.get("primaryCta") ?? "View tours"),
      },
      pages: {
        home: {
          enabled: data.get("homeEnabled") === "on",
          title: String(data.get("homeTitle") ?? ""),
          body: String(data.get("homeBody") ?? ""),
        },
        about: {
          enabled: data.get("aboutEnabled") === "on",
          title: String(data.get("aboutTitle") ?? ""),
          body: String(data.get("aboutBody") ?? ""),
        },
        faq: {
          enabled: data.get("faqEnabled") === "on",
          title: String(data.get("faqTitle") ?? ""),
          body: String(data.get("faqBody") ?? ""),
        },
        policies: {
          enabled: data.get("policiesEnabled") === "on",
          title: String(data.get("policiesTitle") ?? ""),
          body: String(data.get("policiesBody") ?? ""),
        },
        contact: {
          enabled: data.get("contactEnabled") === "on",
          email: String(data.get("contactEmail") ?? "") || null,
          phone: String(data.get("contactPhone") ?? ""),
          address: String(data.get("contactAddress") ?? ""),
        },
      },
      seo: {
        title: String(data.get("seoTitle") ?? ""),
        description: String(data.get("seoDescription") ?? ""),
        socialImageUrl: selectedUrl(data, "socialImageUrl") || null,
      },
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>, action: "save" | "publish") {
    event.preventDefault();
    setBusy(action);
    setError(null);
    setMessage(null);
    const payload = payloadFromForm(event.currentTarget);

    try {
      const response = await fetch(
        action === "publish"
          ? `/api/workspaces/${workspaceId}/storefront/publish`
          : `/api/workspaces/${workspaceId}/storefront`,
        {
          method: action === "publish" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not save the storefront.");
      setMessage(action === "publish" ? "Storefront published." : "Draft saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the storefront.");
    } finally {
      setBusy(null);
    }
  }

  async function publishCurrentDraft() {
    if (!formRef.current) return;
    await submit(
      { preventDefault() {}, currentTarget: formRef.current } as FormEvent<HTMLFormElement>,
      "publish",
    );
  }

  function MediaSelect({ name, defaultValue }: { name: string; defaultValue: string | null }) {
    return (
      <Select name={name} defaultValue={defaultValue ?? ""} disabled={!canManage}>
        <option value="">None</option>
        {uploadedMedia.map((asset) => (
          <option key={asset.id} value={asset.url}>
            {asset.altText}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <form ref={formRef} className="space-y-6" onSubmit={(event) => submit(event, "save")}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Brand name" htmlFor="brand-name">
          <Input id="brand-name" name="brandName" defaultValue={draft.brand.brandName} maxLength={120} disabled={!canManage} required />
        </Field>
        <Field label="Logo" htmlFor="logo-url">
          <MediaSelect name="logoUrl" defaultValue={draft.brand.logoUrl} />
        </Field>
        <Field label="Favicon" htmlFor="favicon-url">
          <MediaSelect name="faviconUrl" defaultValue={draft.brand.faviconUrl} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Primary", "primaryColor", draft.brand.primaryColor],
          ["Secondary", "secondaryColor", draft.brand.secondaryColor],
          ["Accent", "accentColor", draft.brand.accentColor],
          ["Surface", "surfaceColor", draft.brand.surfaceColor],
          ["Text", "textColor", draft.brand.textColor],
        ].map(([label, name, value]) => (
          <Field key={name} label={label} htmlFor={name}>
            <Input id={name} name={name} type="color" defaultValue={value} disabled={!canManage} className="p-1" />
          </Field>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Typography" htmlFor="typography">
          <Select id="typography" name="typography" defaultValue={draft.brand.typography} disabled={!canManage}>
            <option value="system">System</option>
            <option value="serif">Serif</option>
            <option value="rounded">Rounded</option>
          </Select>
        </Field>
        <Field label="Hero image" htmlFor="hero-image">
          <MediaSelect name="heroImageUrl" defaultValue={draft.hero.imageUrl} />
        </Field>
        <Field label="Social image" htmlFor="social-image">
          <MediaSelect name="socialImageUrl" defaultValue={draft.seo.socialImageUrl} />
        </Field>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Hero eyebrow" htmlFor="hero-eyebrow">
          <Input id="hero-eyebrow" name="heroEyebrow" defaultValue={draft.hero.eyebrow} maxLength={80} disabled={!canManage} />
        </Field>
        <Field label="Primary CTA" htmlFor="primary-cta">
          <Input id="primary-cta" name="primaryCta" defaultValue={draft.hero.primaryCta} maxLength={40} disabled={!canManage} />
        </Field>
      </div>

      <Field label="Hero title" htmlFor="hero-title">
        <Input id="hero-title" name="heroTitle" defaultValue={draft.hero.title} maxLength={140} disabled={!canManage} required />
      </Field>
      <Field label="Hero subtitle" htmlFor="hero-subtitle">
        <textarea
          id="hero-subtitle"
          name="heroSubtitle"
          defaultValue={draft.hero.subtitle}
          rows={3}
          maxLength={320}
          disabled={!canManage}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50"
        />
      </Field>

      {[
        ["home", "Home", draft.pages.home],
        ["about", "About", draft.pages.about],
        ["faq", "FAQ", draft.pages.faq],
        ["policies", "Policies", draft.pages.policies],
      ].map(([key, label, section]) => (
        <div key={key as string} className="grid gap-3 rounded-lg border border-border p-4 lg:grid-cols-[180px_1fr]">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" name={`${key}Enabled`} defaultChecked={(section as StorefrontDraft["pages"]["home"]).enabled} disabled={!canManage} className="size-4 rounded border-border accent-[var(--accent)]" />
            {label as string}
          </label>
          <div className="grid gap-3">
            <Input name={`${key}Title`} defaultValue={(section as StorefrontDraft["pages"]["home"]).title} maxLength={120} disabled={!canManage} />
            <textarea
              name={`${key}Body`}
              defaultValue={(section as StorefrontDraft["pages"]["home"]).body}
              rows={3}
              maxLength={2000}
              disabled={!canManage}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50"
            />
          </div>
        </div>
      ))}

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input type="checkbox" name="contactEnabled" defaultChecked={draft.pages.contact.enabled} disabled={!canManage} className="size-4 rounded border-border accent-[var(--accent)]" />
          Contact
        </label>
        <Input name="contactEmail" type="email" defaultValue={draft.pages.contact.email ?? ""} placeholder="hello@example.com" disabled={!canManage} />
        <Input name="contactPhone" defaultValue={draft.pages.contact.phone} placeholder="+1 555 0100" disabled={!canManage} />
        <Input name="contactAddress" defaultValue={draft.pages.contact.address} placeholder="Business address or meeting city" disabled={!canManage} className="lg:col-span-3" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="SEO title" htmlFor="seo-title">
          <Input id="seo-title" name="seoTitle" defaultValue={draft.seo.title} maxLength={70} disabled={!canManage} required />
        </Field>
        <Field label="SEO description" htmlFor="seo-description">
          <Input id="seo-description" name="seoDescription" defaultValue={draft.seo.description} minLength={20} maxLength={180} disabled={!canManage} required />
        </Field>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canManage || busy !== null}>
          <Save className="size-4" aria-hidden />
          {busy === "save" ? "Saving" : "Save draft"}
        </Button>
        <Button type="button" variant="accent" disabled={!canManage || busy !== null} onClick={publishCurrentDraft}>
          <Globe2 className="size-4" aria-hidden />
          {busy === "publish" ? "Publishing" : "Publish"}
        </Button>
        <ButtonLink href={`/book/${workspaceSlug}`} variant="secondary" target="_blank">
          <Eye className="size-4" aria-hidden />
          Preview
        </ButtonLink>
      </div>
    </form>
  );
}
