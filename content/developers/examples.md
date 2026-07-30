---
title: Examples
description: Working recipes — syncing bookings, building a custom booking flow, verifying webhooks, exporting for accounting, and automating with n8n.
eyebrow: API Reference
category: Guides
icon: terminal
order: 6
publishedAt: 2026-07-01
---

> **Status: planned — not yet available.**
>
> Tripistic does not currently expose a public API. There is no API-key model,
> no key-management screen, and no bearer-token authentication path in the
> application: every route authenticates through a signed session cookie.
>
> This page describes the intended design and is published so the direction is
> visible. It is **not** a description of shipped functionality, and nothing on
> it can be called today. It will be replaced with real reference material when
> the API ships.

Copy-paste recipes for the integrations operators build most often.

## 1. Sync confirmed bookings to your warehouse

Pull yesterday's confirmed bookings on a schedule.

```bash
curl -G https://tripistic.com/api/workspaces/$WS/bookings \
  -H "Authorization: Bearer $TRIPISTIC_API_KEY" \
  --data-urlencode "status=CONFIRMED" \
  --data-urlencode "from=2026-07-01" \
  --data-urlencode "to=2026-07-02" \
  --data-urlencode "limit=100"
```

```ts
async function syncDay(date: string) {
  let cursor: string | undefined;
  const rows = [];

  do {
    const query = new URLSearchParams({
      status: "CONFIRMED",
      from: date,
      to: date,
      limit: "100",
    });
    if (cursor) query.set("cursor", cursor);

    const response = await fetch(
      `https://tripistic.com/api/workspaces/${process.env.WS}/bookings?${query}`,
      { headers: { Authorization: `Bearer ${process.env.TRIPISTIC_API_KEY}` } },
    );
    if (!response.ok) throw new Error(`Sync failed: ${response.status}`);

    const page = await response.json();
    rows.push(...page.data);
    cursor = page.pagination.hasMore ? page.pagination.nextCursor : undefined;
  } while (cursor);

  return rows;
}
```

Run it with a one-day overlap so a late webhook or timezone edge never drops a booking.

## 2. Build a custom booking flow

Use the public endpoints so no secret ever reaches the browser.

```ts
// 1. List bookable tours
const tours = await fetch(
  `https://tripistic.com/api/public/${slug}/tours`,
).then((r) => r.json());

// 2. Fetch availability for the chosen tour and month
const availability = await fetch(
  `https://tripistic.com/api/public/${slug}/tours/${tourSlug}/availability?from=2026-08-01&to=2026-08-31`,
).then((r) => r.json());

// 3. Create the booking
const booking = await fetch(`https://tripistic.com/api/public/${slug}/bookings`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    availabilityId: selected.id,
    customer: { name, email, phone },
    participants,
    addOns,
  }),
}).then((r) => r.json());

// 4. Send the traveller to checkout
window.location.href = booking.data.checkoutUrl;
```

Handle `409` in step 3 — the departure sold out while the traveller was choosing. Re-fetch availability and ask them to pick again.

## 3. Verify a webhook (Next.js route handler)

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export async function POST(request: Request) {
  // Read the RAW body — parsing first breaks the signature.
  const raw = await request.text();
  const header = request.headers.get("tripistic-signature") ?? "";

  if (!verify(raw, header, process.env.TRIPISTIC_WEBHOOK_SECRET!)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(raw);

  // Acknowledge immediately; do the work asynchronously.
  await queue.enqueue(event);
  return new Response("ok", { status: 200 });
}

function verify(raw: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string]),
  );
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1 ?? "", "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

## 4. Push new bookings to Slack

```ts
// Handler for the booking.confirmed event
async function onBookingConfirmed(event: WebhookEvent) {
  const booking = event.data;
  const amount = (booking.totalAmount / 100).toFixed(2);

  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `New booking · ${booking.participantCount} pax · ${amount} ${booking.currency}`,
    }),
  });
}
```

## 5. Export for accounting

```ts
const rows = [];

for await (const booking of client.paginate("/bookings")) {
  if (booking.paymentStatus !== "PAID") continue;

  rows.push({
    reference: booking.id,
    date: booking.confirmedAt,
    customer: booking.customer.name,
    gross: booking.totalAmount / 100,
    currency: booking.currency,
    paymentIntent: booking.paymentIntentId, // reconcile against Stripe payouts
  });
}
```

Reconcile `paymentIntent` against your Stripe payout report rather than matching on amount — amounts collide, references do not.

## 6. Automate with n8n or Zapier

**Trigger:** a Tripistic webhook on `booking.confirmed`.

**Steps:**

1. Verify the signature in a code node.
2. Look up the customer in your accounting tool by email.
3. Create or update the contact.
4. Create the invoice line from the booking.
5. Write the invoice reference back with `PATCH /bookings/{id}` in the booking notes.

Filter early — send only the events you actually need to the automation platform, or you will pay for noise.

## 7. Nightly staff assignment audit

```ts
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const departures = await fetch(
  `https://tripistic.com/api/workspaces/${WS}/availability?from=${tomorrow}&to=${tomorrow}`,
  { headers: { Authorization: `Bearer ${KEY}` } },
).then((r) => r.json());

const unstaffed = departures.data.filter(
  (d) => d.bookedSeats > 0 && (!d.guideId || (d.requiresVehicle && !d.vehicleId)),
);

if (unstaffed.length > 0) await alertOperations(unstaffed);
```

Catching an unstaffed departure at 18:00 the night before is considerably cheaper than at 08:00 on the day.

## Related

- [REST API](/developers/rest-api) · [Webhooks](/developers/webhooks) · [SDKs](/developers/sdk) · [Rate Limits](/developers/rate-limits)
