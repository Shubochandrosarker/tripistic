"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";
import { MAX_PARTICIPANTS_PER_BOOKING } from "@/lib/constants";

export type BookingAddonOption = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  maxPerBooking: number | null;
};

export type BookingDeparture = {
  id: string;
  startsAt: string;
  endsAt: string;
  remainingCapacity: number;
  unitPrice: number;
};

export function TourBookingForm({
  workspaceSlug,
  timezone,
  currency,
  addons,
  availabilities,
}: {
  workspaceSlug: string;
  tourSlug: string;
  timezone: string;
  currency: string;
  basePrice: number;
  maxCapacity: number;
  addons: BookingAddonOption[];
  availabilities: BookingDeparture[];
}) {
  const router = useRouter();
  const bookable = availabilities.filter((a) => a.remainingCapacity > 0);
  const [availabilityId, setAvailabilityId] = useState<string | null>(bookable[0]?.id ?? null);
  const [partySize, setPartySize] = useState(1);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const selected = bookable.find((a) => a.id === availabilityId) ?? null;
  const maxPartySize = Math.min(selected?.remainingCapacity ?? 1, MAX_PARTICIPANTS_PER_BOOKING);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [timezone],
  );

  const addonsTotal = addons.reduce((sum, a) => sum + a.price * (addonQty[a.id] ?? 0), 0);
  const subtotal = (selected?.unitPrice ?? 0) * partySize;
  const total = subtotal + addonsTotal;

  function selectAvailability(id: string) {
    setAvailabilityId(id);
    setPartySize(1);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selected) {
      setError("Choose a departure date to continue.");
      return;
    }
    if (partySize < 1 || partySize > selected.remainingCapacity) {
      setError(
        `Only ${selected.remainingCapacity} seat${selected.remainingCapacity === 1 ? "" : "s"} left for this departure.`,
      );
      return;
    }

    const form = new FormData(event.currentTarget);
    const website = String(form.get("website") ?? "");

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
      setError("Enter an email address so the operator can reach you.");
      return;
    }

    if (form.get("termsAccepted") !== "on") {
      setError("You must accept the cancellation policy and terms to book.");
      return;
    }

    const payload = {
      availabilityId: selected.id,
      participantCount: partySize,
      participants,
      guestFirstName: participants[0].firstName,
      guestLastName: participants[0].lastName,
      guestEmail,
      guestPhone: String(form.get("guestPhone") ?? "").trim() || undefined,
      guestNotes: String(form.get("guestNotes") ?? "").trim() || undefined,
      addons: addons
        .filter((a) => (addonQty[a.id] ?? 0) > 0)
        .map((a) => ({ tourAddonId: a.id, quantity: addonQty[a.id] })),
      termsAccepted: true as const,
      idempotencyKey,
      website,
    };

    setBusy(true);
    try {
      const res = await fetch(`/api/public/${workspaceSlug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; booking?: { publicToken: string }; payment?: { checkoutUrl: string | null } | null }
        | null;
      if (!res.ok || !body?.booking) {
        setError(body?.error ?? "Could not complete your booking. Please try again.");
        setBusy(false);
        return;
      }
      if (body.payment?.checkoutUrl) {
        // Full navigation, not router.push — this is an external Stripe URL,
        // and the booking stays reserved-but-pending until the guest either
        // pays there or the reservation's payment window expires.
        window.location.href = body.payment.checkoutUrl;
        return;
      }
      router.push(`/book/confirmation/${body.booking.publicToken}`);
    } catch {
      setError("Could not complete your booking. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (bookable.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        No upcoming departures are open for booking right now. Check back soon, or contact the operator directly.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate aria-busy={busy}>
      {/* Honeypot — real visitors never see or fill this in. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] top-auto size-px overflow-hidden"
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-foreground">1. Choose a date</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {bookable.map((departure) => {
            const isSelected = departure.id === availabilityId;
            return (
              <button
                key={departure.id}
                type="button"
                onClick={() => selectAvailability(departure.id)}
                aria-pressed={isSelected}
                data-testid="departure-option"
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  isSelected
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-card text-foreground hover:border-accent/50"
                }`}
              >
                <span className="block font-medium">{dateFormatter.format(new Date(departure.startsAt))}</span>
                <span className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatMoney(departure.unitPrice, currency)} / guest</span>
                  <span>
                    {departure.remainingCapacity} seat{departure.remainingCapacity === 1 ? "" : "s"} left
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {selected ? (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">2. Group size</legend>
            <Field label="Number of guests" htmlFor="party-size">
              <Input
                id="party-size"
                type="number"
                min={1}
                max={maxPartySize}
                value={partySize}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setPartySize(Number.isFinite(next) ? Math.min(Math.max(next, 1), maxPartySize) : 1);
                }}
                className="max-w-[8rem]"
              />
            </Field>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-foreground">3. Guest details</legend>
            {Array.from({ length: partySize }, (_, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-2">
                <Field label={i === 0 ? "First name (that's you)" : `Guest ${i + 1} — first name`} htmlFor={`p-${i}-first`}>
                  <Input id={`p-${i}-first`} name={`participant-${i}-firstName`} maxLength={100} required />
                </Field>
                <Field label={i === 0 ? "Last name" : `Guest ${i + 1} — last name`} htmlFor={`p-${i}-last`}>
                  <Input id={`p-${i}-last`} name={`participant-${i}-lastName`} maxLength={100} required />
                </Field>
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" htmlFor="guest-email" hint="Your confirmation link will use this.">
                <Input id="guest-email" name="guestEmail" type="email" maxLength={254} required />
              </Field>
              <Field label="Phone (optional)" htmlFor="guest-phone">
                <Input id="guest-phone" name="guestPhone" type="tel" maxLength={40} />
              </Field>
            </div>
            <Field label="Special requests (optional)" htmlFor="guest-notes">
              <textarea
                id="guest-notes"
                name="guestNotes"
                rows={2}
                maxLength={1000}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                placeholder="Dietary needs, accessibility, anything we should know"
              />
            </Field>
          </fieldset>

          {addons.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">4. Add-ons</legend>
              {addons.map((addon) => {
                const max = Math.min(addon.maxPerBooking ?? 20, 20);
                const qty = addonQty[addon.id] ?? 0;
                return (
                  <div
                    key={addon.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{addon.name}</p>
                      {addon.description ? (
                        <p className="text-xs text-muted-foreground">{addon.description}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">{formatMoney(addon.price, currency)} each</p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={max}
                      value={qty}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setAddonQty((prev) => ({
                          ...prev,
                          [addon.id]: Number.isFinite(next) ? Math.min(Math.max(next, 0), max) : 0,
                        }));
                      }}
                      data-testid="addon-quantity"
                      className="w-20 shrink-0"
                    />
                  </div>
                );
              })}
            </fieldset>
          ) : null}

          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-sm font-semibold text-foreground">Order summary</p>
            <dl className="space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <dt>
                  {formatMoney(selected.unitPrice, currency)} × {partySize} guest{partySize === 1 ? "" : "s"}
                </dt>
                <dd>{formatMoney(subtotal, currency)}</dd>
              </div>
              {addonsTotal > 0 ? (
                <div className="flex justify-between">
                  <dt>Add-ons</dt>
                  <dd>{formatMoney(addonsTotal, currency)}</dd>
                </div>
              ) : null}
            </dl>
            <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
              <span>Total</span>
              <span>{formatMoney(total, currency)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {total > 0
                ? "This reserves your seats now — you'll pay securely on the next page."
                : "This reserves your seats now — no payment is required for this booking."}
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="termsAccepted"
              required
              className="mt-0.5 size-4 rounded border-border accent-[var(--accent)]"
            />
            <span>I accept the cancellation policy and terms for this booking.</span>
          </label>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          <Button type="submit" disabled={busy} data-testid="submit-booking" className="w-full sm:w-auto">
            {busy
              ? "Booking…"
              : total > 0
                ? `Continue to payment — ${formatMoney(total, currency)}`
                : "Book now — free"}
          </Button>
        </>
      ) : null}
    </form>
  );
}
