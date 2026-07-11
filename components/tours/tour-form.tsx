"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  CURRENCIES,
  TOUR_KINDS,
  TOUR_KIND_LABELS,
  TOUR_STATUSES,
  TOUR_VISIBILITIES,
  type TourKindValue,
} from "@/lib/constants";

export type TourFormValues = {
  id: string;
  title: string;
  kind: string;
  status: string;
  visibility: string;
  description: string | null;
  durationMinutes: number;
  durationDays: number | null;
  location: string | null;
  meetingPoint: string | null;
  capacity: number;
  basePrice: number;
  currency: string;
  cancellationPolicy: string | null;
  cancellationNoticeHours: number | null;
  waiverRequired: boolean;
  coverImageUrl: string | null;
};

export function TourForm({
  workspaceId,
  defaultCurrency,
  tour,
}: {
  workspaceId: string;
  defaultCurrency: string;
  /** Present in edit mode; absent in create mode. */
  tour?: TourFormValues;
}) {
  const router = useRouter();
  const isEdit = Boolean(tour);
  const [kind, setKind] = useState<TourKindValue>((tour?.kind as TourKindValue) ?? "tour");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const priceMajor = parseFloat(String(form.get("basePrice") ?? "0"));
    const payload: Record<string, unknown> = {
      title: String(form.get("title") ?? ""),
      kind: String(form.get("kind") ?? "tour"),
      visibility: String(form.get("visibility") ?? "public"),
      description: String(form.get("description") ?? ""),
      durationMinutes: Number(form.get("durationMinutes") ?? 0),
      durationDays: String(form.get("durationDays") ?? ""),
      location: String(form.get("location") ?? ""),
      meetingPoint: String(form.get("meetingPoint") ?? ""),
      capacity: Number(form.get("capacity") ?? 0),
      basePrice: Number.isFinite(priceMajor) ? Math.round(priceMajor * 100) : -1,
      currency: String(form.get("currency") ?? defaultCurrency),
      cancellationPolicy: String(form.get("cancellationPolicy") ?? ""),
      cancellationNoticeHours: String(form.get("cancellationNoticeHours") ?? ""),
      waiverRequired: form.get("waiverRequired") === "on",
      coverImageUrl: String(form.get("coverImageUrl") ?? ""),
    };
    if (isEdit) payload.status = String(form.get("status") ?? "draft");

    try {
      const res = await fetch(
        isEdit
          ? `/api/workspaces/${workspaceId}/tours/${tour!.id}`
          : `/api/workspaces/${workspaceId}/tours`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json().catch(() => null)) as
        | { error?: string; tour?: { id: string } }
        | null;

      if (!res.ok) {
        setError(body?.error ?? "Could not save the tour. Check the fields and try again.");
        setBusy(false);
        return;
      }

      if (isEdit) {
        setSaved(true);
        setBusy(false);
        router.refresh();
      } else {
        router.push(`/dashboard/tours/${body?.tour?.id}`);
        router.refresh();
      }
    } catch {
      setError("Could not save the tour. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!tour) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/tours/${tour.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/dashboard/tours");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not delete the tour.");
    } catch {
      setError("Could not delete the tour.");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="tour-title">
          <Input
            id="tour-title"
            name="title"
            defaultValue={tour?.title}
            placeholder="Sunset Desert Jeep Tour"
            minLength={2}
            maxLength={120}
            required
          />
        </Field>
        <Field label="Type" htmlFor="tour-kind">
          <Select
            id="tour-kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as TourKindValue)}
          >
            {TOUR_KINDS.map((value) => (
              <option key={value} value={value}>
                {TOUR_KIND_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description" htmlFor="tour-description">
        <textarea
          id="tour-description"
          name="description"
          defaultValue={tour?.description ?? ""}
          rows={4}
          maxLength={5000}
          placeholder="What makes this experience special? Guests will see this on your public booking page."
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Duration (minutes)" htmlFor="tour-duration">
          <Input
            id="tour-duration"
            name="durationMinutes"
            type="number"
            min={15}
            max={43200}
            step={5}
            defaultValue={tour?.durationMinutes ?? 120}
            required
          />
        </Field>
        {kind === "package" ? (
          <Field label="Duration (days)" htmlFor="tour-duration-days">
            <Input
              id="tour-duration-days"
              name="durationDays"
              type="number"
              min={1}
              max={60}
              defaultValue={tour?.durationDays ?? 2}
            />
          </Field>
        ) : (
          <input type="hidden" name="durationDays" value="" />
        )}
        <Field label="Capacity per departure" htmlFor="tour-capacity">
          <Input
            id="tour-capacity"
            name="capacity"
            type="number"
            min={1}
            max={1000}
            defaultValue={tour?.capacity ?? 10}
            required
          />
        </Field>
        <Field label="Visibility" htmlFor="tour-visibility">
          <Select id="tour-visibility" name="visibility" defaultValue={tour?.visibility ?? "public"}>
            {TOUR_VISIBILITIES.map((value) => (
              <option key={value} value={value}>
                {value === "public" ? "Public (bookable page later)" : "Private (invite/manual only)"}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Base price" htmlFor="tour-price" hint="Per guest.">
          <Input
            id="tour-price"
            name="basePrice"
            type="number"
            min={0}
            step="0.01"
            defaultValue={tour ? (tour.basePrice / 100).toFixed(2) : "49.00"}
            required
          />
        </Field>
        <Field label="Currency" htmlFor="tour-currency">
          <Select id="tour-currency" name="currency" defaultValue={tour?.currency ?? defaultCurrency}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location" htmlFor="tour-location">
          <Input
            id="tour-location"
            name="location"
            defaultValue={tour?.location ?? ""}
            maxLength={160}
            placeholder="Sedona, AZ"
          />
        </Field>
        <Field label="Meeting point" htmlFor="tour-meeting">
          <Input
            id="tour-meeting"
            name="meetingPoint"
            defaultValue={tour?.meetingPoint ?? ""}
            maxLength={240}
            placeholder="Main visitor center, north entrance"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Cancellation policy"
          htmlFor="tour-cancellation"
          hint="Shown to guests during booking and on their confirmation."
        >
          <textarea
            id="tour-cancellation"
            name="cancellationPolicy"
            defaultValue={tour?.cancellationPolicy ?? ""}
            rows={3}
            maxLength={2000}
            placeholder="Free cancellation up to 24 hours before the tour."
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        </Field>
        <div className="space-y-4">
          <Field label="Cancellation notice (hours)" htmlFor="tour-notice">
            <Input
              id="tour-notice"
              name="cancellationNoticeHours"
              type="number"
              min={0}
              max={720}
              defaultValue={tour?.cancellationNoticeHours ?? ""}
              placeholder="24"
            />
          </Field>
          <Field
            label="Cover image URL"
            htmlFor="tour-cover"
            hint="Media uploads arrive with file storage in a later phase — paste a URL for now."
          >
            <Input
              id="tour-cover"
              name="coverImageUrl"
              type="url"
              defaultValue={tour?.coverImageUrl ?? ""}
              maxLength={500}
              placeholder="https://…"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="waiverRequired"
              defaultChecked={tour?.waiverRequired ?? false}
              className="size-4 rounded border-border accent-[var(--accent)]"
            />
            Waiver required (signing flow arrives in Phase 6)
          </label>
          {isEdit ? (
            <Field label="Status" htmlFor="tour-status">
              <Select id="tour-status" name="status" defaultValue={tour?.status ?? "draft"}>
                {TOUR_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-600 dark:text-emerald-400">Tour saved.</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Create tour"}
        </Button>
        {isEdit ? (
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 dark:text-red-400"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            Delete tour
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this tour?"
        description="The tour will be removed from your catalog and all of its upcoming departures will be cancelled. This cannot be undone from the UI."
        confirmLabel="Delete tour"
        danger
        busy={busy}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </form>
  );
}
