"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { DAYS_OF_WEEK } from "@/lib/constants";

export type ScheduleRow = {
  id: string;
  name: string | null;
  daysOfWeek: number[];
  startTime: string;
  durationMinutes: number | null;
  capacity: number | null;
  startsOn: string; // YYYY-MM-DD
  endsOn: string | null;
  status: string;
};

function daysLabel(days: number[]) {
  return DAYS_OF_WEEK.filter((d) => days.includes(d.value))
    .map((d) => d.short)
    .join(", ");
}

export function SchedulesPanel({
  workspaceId,
  tourId,
  timezone,
  schedules,
  canManage,
}: {
  workspaceId: string;
  tourId: string;
  timezone: string;
  schedules: ScheduleRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(path: string, init: RequestInit): Promise<Response | null> {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "The action failed. Try again.");
        return null;
      }
      router.refresh();
      return res;
    } catch {
      setError("The action failed. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const days = DAYS_OF_WEEK.filter((d) => form.get(`day-${d.value}`) === "on").map(
      (d) => d.value,
    );
    const res = await call(`/api/workspaces/${workspaceId}/tours/${tourId}/schedules`, {
      method: "POST",
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        daysOfWeek: days,
        startTime: String(form.get("startTime") ?? ""),
        startsOn: String(form.get("startsOn") ?? ""),
        endsOn: String(form.get("endsOn") ?? "") || undefined,
        capacity: String(form.get("capacity") ?? ""),
        durationMinutes: String(form.get("durationMinutes") ?? ""),
      }),
    });
    if (res) {
      const body = (await res.json().catch(() => null)) as { generatedSlots?: number } | null;
      setNotice(
        `Schedule created — ${body?.generatedSlots ?? 0} upcoming departures generated for the next 90 days.`,
      );
      formElement.reset();
    }
  }

  async function onGenerate(scheduleId: string) {
    const res = await call(
      `/api/workspaces/${workspaceId}/tours/${tourId}/schedules/${scheduleId}/generate`,
      { method: "POST", body: JSON.stringify({ days: 90 }) },
    );
    if (res) {
      const body = (await res.json().catch(() => null)) as { created?: number } | null;
      setNotice(
        body?.created
          ? `${body.created} new departures generated.`
          : "Everything in the next 90 days is already generated.",
      );
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          {notice}
        </p>
      ) : null}

      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recurring schedules yet. Add one (e.g. &ldquo;Sat &amp; Sun at 09:00&rdquo;) and
          Tripistic will generate the upcoming departures automatically. Times are in your
          workspace timezone ({timezone}).
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {schedule.name || `${daysLabel(schedule.daysOfWeek)} at ${schedule.startTime}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {daysLabel(schedule.daysOfWeek)} · {schedule.startTime} ({timezone}) · from{" "}
                  {schedule.startsOn}
                  {schedule.endsOn ? ` to ${schedule.endsOn}` : ""}
                  {schedule.capacity ? ` · capacity ${schedule.capacity}` : ""}
                </p>
              </div>
              <StatusBadge status={schedule.status} />
              {canManage ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onGenerate(schedule.id)}
                  >
                    <CalendarPlus className="size-3.5" aria-hidden /> Generate 90d
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      call(
                        `/api/workspaces/${workspaceId}/tours/${tourId}/schedules/${schedule.id}`,
                        {
                          method: "PATCH",
                          body: JSON.stringify({
                            status: schedule.status === "active" ? "paused" : "active",
                          }),
                        },
                      )
                    }
                  >
                    {schedule.status === "active" ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete schedule"
                    disabled={busy}
                    onClick={() =>
                      call(
                        `/api/workspaces/${workspaceId}/tours/${tourId}/schedules/${schedule.id}`,
                        { method: "DELETE" },
                      )
                    }
                  >
                    <Trash2 className="size-4 text-red-500" aria-hidden />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form onSubmit={onAdd} className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-semibold text-foreground">Add a recurring schedule</p>
          <div className="flex flex-wrap gap-3">
            {DAYS_OF_WEEK.map((day) => (
              <label key={day.value} className="flex items-center gap-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  name={`day-${day.value}`}
                  className="size-4 rounded border-border accent-[var(--accent)]"
                />
                {day.short}
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={`Start time (${timezone})`} htmlFor="schedule-time">
              <Input id="schedule-time" name="startTime" type="time" required />
            </Field>
            <Field label="From date" htmlFor="schedule-start">
              <Input id="schedule-start" name="startsOn" type="date" required />
            </Field>
            <Field label="Until (optional)" htmlFor="schedule-end">
              <Input id="schedule-end" name="endsOn" type="date" />
            </Field>
            <Field label="Capacity override" htmlFor="schedule-capacity">
              <Input id="schedule-capacity" name="capacity" type="number" min={1} max={1000} placeholder="tour default" />
            </Field>
            <Field label="Duration override (min)" htmlFor="schedule-duration">
              <Input id="schedule-duration" name="durationMinutes" type="number" min={15} max={43200} placeholder="tour default" />
            </Field>
          </div>
          <input type="hidden" name="name" value="" />
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create schedule + generate departures"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
