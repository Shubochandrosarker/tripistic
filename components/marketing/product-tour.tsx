"use client";

import { useId, useState } from "react";
import { CalendarCheck, Bot, Radio, Users, X } from "lucide-react";

import { trackEvent } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

type Hotspot = {
  id: string;
  /** Percentage position within the preview frame. */
  x: number;
  y: number;
  title: string;
  description: string;
};

type Scene = {
  id: string;
  label: string;
  icon: typeof CalendarCheck;
  headline: string;
  summary: string;
  panels: { title: string; rows: string[] }[];
  hotspots: Hotspot[];
};

const SCENES: Scene[] = [
  {
    id: "operations",
    label: "Operations",
    icon: Radio,
    headline: "The trip day, on one screen",
    summary:
      "Every departure with its status, staffing, and participants. Delays and incidents are recorded where they happen, and travellers are notified in one action.",
    panels: [
      { title: "Today", rows: ["8 departures", "92 guests", "3 alerts"] },
      { title: "Staffing", rows: ["7 guides assigned", "1 unassigned", "4 vehicles out"] },
      { title: "Status", rows: ["2 boarding", "5 departed", "1 delayed"] },
    ],
    hotspots: [
      {
        id: "status",
        x: 22,
        y: 30,
        title: "Live departure status",
        description:
          "Scheduled, boarding, departed, delayed, completed. Setting a delay prompts for the reason and offers to notify everyone booked.",
      },
      {
        id: "staffing",
        x: 62,
        y: 30,
        title: "Assignment gaps surface early",
        description:
          "Departures with bookings but no guide, driver, or vehicle are highlighted the evening before, not the morning of.",
      },
      {
        id: "checkin",
        x: 45,
        y: 74,
        title: "Check-in from the field",
        description:
          "Guides check participants in on a phone, seeing waiver status, payment status, and dietary or accessibility notes per person.",
      },
    ],
  },
  {
    id: "bookings",
    label: "Bookings",
    icon: CalendarCheck,
    headline: "One record per reservation",
    summary:
      "Who is travelling, on which departure, what they paid, what they signed, and every change since. Seats are reserved atomically, so overbooking cannot happen.",
    panels: [
      { title: "Pipeline", rows: ["14 pending", "128 confirmed", "3 expiring"] },
      { title: "Payments", rows: ["$42.8k MTD", "6 unpaid", "2 retries"] },
      { title: "Documents", rows: ["88 waivers signed", "4 outstanding", "12 vouchers"] },
    ],
    hotspots: [
      {
        id: "atomic",
        x: 26,
        y: 34,
        title: "Atomic seat reservation",
        description:
          "Two travellers booking the last seat produce one success and one clean capacity error — never an overbooking.",
      },
      {
        id: "expiry",
        x: 66,
        y: 34,
        title: "Pending expiry sweep",
        description:
          "Unpaid bookings release their seats automatically when the payment window elapses, so abandoned checkouts stop blocking inventory.",
      },
      {
        id: "timeline",
        x: 45,
        y: 76,
        title: "Full change history",
        description:
          "Every modification writes to the booking timeline with the actor and timestamp. You always know who changed what.",
      },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    icon: Users,
    headline: "History that maintains itself",
    summary:
      "Bookings, payments, messages, waivers, and portal activity all write to the same customer record. Nobody logs activity by hand.",
    panels: [
      { title: "Customers", rows: ["1,284 records", "312 repeat", "48 lapsed"] },
      { title: "Pipeline", rows: ["22 leads", "9 proposals", "6 won this month"] },
      { title: "Companies", rows: ["18 agencies", "4 corporate", "2 schools"] },
    ],
    hotspots: [
      {
        id: "timeline",
        x: 24,
        y: 32,
        title: "Automatic timeline",
        description:
          "Derived from real events rather than manual logging, so the history is accurate without anyone maintaining it.",
      },
      {
        id: "segments",
        x: 64,
        y: 32,
        title: "Segments that drive revenue",
        description:
          "Repeat travellers, lapsed customers, high-value guests, and everyone who never left a review — filtered in seconds.",
      },
      {
        id: "companies",
        x: 45,
        y: 74,
        title: "Agency and corporate revenue",
        description:
          "Companies group the people who book on behalf of an organisation, with net-rate terms and attributed revenue.",
      },
    ],
  },
  {
    id: "ai",
    label: "AI",
    icon: Bot,
    headline: "AI that reads your own data",
    summary:
      "Itinerary drafts in under a minute, business insights from your actual bookings, and natural-language search across every record.",
    panels: [
      { title: "Itineraries", rows: ["7-day draft ready", "v4 saved", "3 vendors costed"] },
      { title: "Insights", rows: ["Health score 78", "2 pricing ideas", "1 risk alert"] },
      { title: "Search", rows: ["Unpaid next weekend", "Ana · last August", "German guides free"] },
    ],
    hotspots: [
      {
        id: "itinerary",
        x: 24,
        y: 30,
        title: "First draft, not final answer",
        description:
          "Generated from your tour catalog, vendors, and costs — then edited by you. Versions are tracked and shareable.",
      },
      {
        id: "insights",
        x: 64,
        y: 30,
        title: "Insights on a schedule",
        description:
          "Load factor patterns, pricing signals, at-risk relationships, and demand risk, surfaced without anyone running a report.",
      },
      {
        id: "governance",
        x: 45,
        y: 74,
        title: "Your provider, your key",
        description:
          "Configure OpenAI, OpenRouter, or another provider. Usage bills to your account and customer content never trains third-party models.",
      },
    ],
  },
];

export function ProductTour() {
  const [sceneId, setSceneId] = useState(SCENES[0].id);
  const [activeHotspot, setActiveHotspot] = useState<string | null>(null);
  const panelId = useId();

  const scene = SCENES.find((item) => item.id === sceneId) ?? SCENES[0];
  const hotspot = scene.hotspots.find((item) => item.id === activeHotspot) ?? null;

  function selectScene(id: string) {
    setSceneId(id);
    setActiveHotspot(null);
    trackEvent("comparison_view", { scene: id });
  }

  return (
    <div>
      <div role="tablist" aria-label="Product areas" className="flex flex-wrap justify-center gap-2">
        {SCENES.map((item) => {
          const active = item.id === scene.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${panelId}-tab-${item.id}`}
              aria-selected={active}
              aria-controls={`${panelId}-panel`}
              onClick={() => selectScene(item.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${panelId}-panel`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-${scene.id}`}
        className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_.65fr]"
      >
        <div className="relative rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {scene.label}
              </p>
              <h3 className="mt-1 text-xl font-semibold text-foreground">{scene.headline}</h3>
            </div>
            <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
              Live preview
            </span>
          </div>

          <div className="relative mt-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {scene.panels.map((panel) => (
                <div key={panel.title} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-sm font-medium text-foreground">{panel.title}</p>
                  {panel.rows.map((row) => (
                    <p
                      key={row}
                      className="mt-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground"
                    >
                      {row}
                    </p>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-3 h-36 rounded-lg border border-border bg-[linear-gradient(135deg,var(--muted),var(--card))] p-4">
              <div className="flex h-full items-end gap-2">
                {[38, 62, 45, 81, 57, 90, 68, 84, 72, 95].map((height, index) => (
                  <span
                    key={index}
                    className="flex-1 rounded-t bg-accent/70"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>

            {scene.hotspots.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveHotspot(item.id === activeHotspot ? null : item.id)}
                aria-pressed={item.id === activeHotspot}
                style={{ left: `${item.x}%`, top: `${item.y}%` }}
                className={cn(
                  "absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  item.id === activeHotspot
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-accent/60 bg-background text-accent hover:scale-110",
                )}
              >
                +<span className="sr-only">{item.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          {hotspot ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-base font-semibold text-foreground">{hotspot.title}</h4>
                <button
                  type="button"
                  onClick={() => setActiveHotspot(null)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <X className="size-4" aria-hidden />
                  <span className="sr-only">Close detail</span>
                </button>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{hotspot.description}</p>
            </div>
          ) : (
            <div>
              <h4 className="text-base font-semibold text-foreground">{scene.label}</h4>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{scene.summary}</p>
              <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Select a <span className="font-semibold text-accent">+</span> marker on the preview to
                explore a specific capability.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
