"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { formatDateTimeInTz, formatMoney } from "@/lib/utils";
import { MAX_PARTICIPANTS_PER_BOOKING } from "@/lib/constants";

type TourOption = {
  id: string;
  title: string;
  visibility: string;
  basePrice: number;
  currency: string;
  capacity: number;
};

type AddonOption = { id: string; name: string; price: number; maxPerBooking: number | null; isActive: boolean };
type DepartureOption = { id: string; startsAt: string; capacity: number; bookedCount: number; priceOverride: number | null; status: string };

export function ManualBookingForm({
  workspaceId,
  timezone,
  tours,
}: {
  workspaceId: string;
  timezone: string;
  tours: TourOption[];
}) {
  const router = useRouter();
  const [tourId, setTourId] = useState<string>(tours[0]?.id ?? "");
  const [addons, setAddons] = useState<AddonOption[]>([]);
  const [availabilities, setAvailabilities] = useState<DepartureOption[]>([]);
  const [loadingTour, setLoadingTour] = useState(false);
  const [availabilityId, setAvailabilityId] = useState<string>("");
  const [partySize, setPartySize] = useState(1);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<"pending" | "confirmed">("confirmed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tour = tours.find((t) => t.id === tourId) ?? null;

  useEffect(() => {
    if (!tourId) return;
    let cancelled = false;
    setLoadingTour(true);
    setAvailabilityId("");
    setAddonQty({});

    Promise.all([
      fetch(`/api/workspaces/${workspaceId}/tours/${tourId}`).then((r) => r.json()),
      fetch(`/api/workspaces/${workspaceId}/tours/${tourId}/availabilities?limit=100`).then((r) => r.json()),
    ])
      .then(([tourBody, availabilityBody]) => {
        if (cancelled) return;
        setAddons((tourBody?.addons ?? []).filter((a: AddonOption) => a.isActive));
        const upcoming = (availabilityBody?.availabilities ?? []).filter(
          (a: DepartureOption) => a.status === "scheduled" && new Date(a.startsAt).getTime() > Date.now(),
        );
        setAvailabilities(upcoming);
        if (upcoming.length > 0) setAvailabilityId(upcoming[0].id);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this tour's departures. Try again.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTour(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tourId, workspaceId]);

  const selected = availabilities.find((a) => a.id === availabilityId) ?? null;
  const remaining = selected ? Math.max(selected.capacity - selected.bookedCount, 0) : 0;
  const unitPrice = selected?.priceOverride ?? tour?.basePrice ?? 0;
  const addonsTotal = addons.reduce((sum, a) => sum + a.price * (addonQty[a.id] ?? 0), 0);
  const total = unitPrice * partySize + addonsTotal;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!tourId || !availabilityId) {
      setError("Choose a tour and a departure.");
      return;
    }
    if (partySize < 1 || partySize > remaining) {
      setError(`Only ${remaining} seat${remaining === 1 ? "" : "s"} left for this departure.`);
      return;
    }

    const form = new FormData(event.currentTarget);
    const participants = Array.from({ length: partySize }, (_, i) => ({
      firstName: String(form.get(`participant-${i}-firstName`) ?? "").trim(),
      lastName: String(form.get(`participant-${i}-lastName`) ?? "").trim(),
    }));
    if (participants.some((p) => !p.firstName || !p.lastName)) {
      setError("Enter a first and last name for every guest.");
      return;
    }
    const guestEmail = String(form.get("guestEmail") ?? "").trim();
    if (!guestEmail) {
      setError("Enter a guest email address.");
      return;
    }

    const payload = {
      tourId,
      availabilityId,
      participantCount: partySize,
      participants,
      guestFirstName: participants[0].firstName,
      guestLastName: participants[0].lastName,
      guestEmail,
      guestPhone: String(form.get("guestPhone") ?? "").trim() || undefined,
      guestNotes: String(form.get("guestNotes") ?? "").trim() || undefined,
      operatorNotes: String(form.get("operatorNotes") ?? "").trim() || undefined,
      addons: addons
        .filter((a) => (addonQty[a.id] ?? 0) > 0)
        .map((a) => ({ tourAddonId: a.id, quantity: addonQty[a.id] })),
      status,
    };

    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; booking?: { id: string } }
        | null;
      if (!res.ok || !body?.booking) {
        setError(body?.error ?? "Could not create the booking. Check the fields and try again.");
        setBusy(false);
        return;
      }
      router.push(`/dashboard/bookings/${body.booking.id}`);
    } catch {
      setError("Could not create the booking. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (tours.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You need at least one active tour before creating a booking.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tour" htmlFor="tour-select">
          <Select id="tour-select" value={tourId} onChange={(event) => setTourId(event.target.value)}>
            {tours.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.visibility === "private" ? " (private)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Departure" htmlFor="departure-select" hint={loadingTour ? "Loading…" : undefined}>
          <Select
            id="departure-select"
            value={availabilityId}
            onChange={(event) => {
              setAvailabilityId(event.target.value);
              setPartySize(1);
            }}
            disabled={loadingTour || availabilities.length === 0}
          >
            {availabilities.length === 0 ? (
              <option value="">No upcoming departures</option>
            ) : (
              availabilities.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatDateTimeInTz(a.startsAt, timezone)} · {Math.max(a.capacity - a.bookedCount, 0)} left
                </option>
              ))
            )}
          </Select>
        </Field>
      </div>

      {selected ? (
        <>
          <Field label="Party size" htmlFor="party-size">
            <Input
              id="party-size"
              type="number"
              min={1}
              max={Math.min(remaining, MAX_PARTICIPANTS_PER_BOOKING)}
              value={partySize}
              onChange={(event) => {
                const next = Number(event.target.value);
                setPartySize(Number.isFinite(next) ? Math.min(Math.max(next, 1), remaining) : 1);
              }}
              className="max-w-[8rem]"
            />
          </Field>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-foreground">Guest details</legend>
            {Array.from({ length: partySize }, (_, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-2">
                <Field label={i === 0 ? "Lead guest — first name" : `Guest ${i + 1} — first name`} htmlFor={`m-${i}-first`}>
                  <Input id={`m-${i}-first`} name={`participant-${i}-firstName`} maxLength={100} required />
                </Field>
                <Field label={i === 0 ? "Lead guest — last name" : `Guest ${i + 1} — last name`} htmlFor={`m-${i}-last`}>
                  <Input id={`m-${i}-last`} name={`participant-${i}-lastName`} maxLength={100} required />
                </Field>
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" htmlFor="m-guest-email">
                <Input id="m-guest-email" name="guestEmail" type="email" maxLength={254} required />
              </Field>
              <Field label="Phone (optional)" htmlFor="m-guest-phone">
                <Input id="m-guest-phone" name="guestPhone" type="tel" maxLength={40} />
              </Field>
            </div>
            <Field label="Guest notes (optional)" htmlFor="m-guest-notes">
              <textarea
                id="m-guest-notes"
                name="guestNotes"
                rows={2}
                maxLength={1000}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              />
            </Field>
          </fieldset>

          {addons.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">Add-ons</legend>
              {addons.map((addon) => {
                const max = Math.min(addon.maxPerBooking ?? 20, 20);
                return (
                  <div key={addon.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                    <p className="text-sm font-medium text-foreground">
                      {addon.name} <span className="font-normal text-muted-foreground">({formatMoney(addon.price, tour!.currency)})</span>
                    </p>
                    <Input
                      type="number"
                      min={0}
                      max={max}
                      value={addonQty[addon.id] ?? 0}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setAddonQty((prev) => ({ ...prev, [addon.id]: Number.isFinite(next) ? Math.min(Math.max(next, 0), max) : 0 }));
                      }}
                      className="w-20 shrink-0"
                    />
                  </div>
                );
              })}
            </fieldset>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="m-status">
              <Select id="m-status" value={status} onChange={(event) => setStatus(event.target.value as "pending" | "confirmed")}>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending (soft hold)</option>
              </Select>
            </Field>
            <Field label="Operator notes (optional)" htmlFor="m-operator-notes" hint="Internal only — never shown to the guest.">
              <Input id="m-operator-notes" name="operatorNotes" maxLength={2000} />
            </Field>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>
                {formatMoney(unitPrice, tour!.currency)} × {partySize}
                {addonsTotal > 0 ? " + add-ons" : ""}
              </span>
              <span className="font-semibold text-foreground">{formatMoney(total, tour!.currency)}</span>
            </div>
          </div>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <Button type="submit" disabled={busy || !availabilityId}>
            {busy ? "Creating…" : "Create booking"}
          </Button>
        </>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </form>
  );
}
