import type { FeatureScreenshot } from "@/lib/marketing/content";

/**
 * Renders a representative interface state as live markup rather than a raster
 * image — it stays sharp at any resolution, follows the active theme, costs no
 * image bytes, and its content is readable by assistive technology.
 */
export function ScreenshotFrame({ screenshot }: { screenshot: FeatureScreenshot }) {
  return (
    <figure className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" aria-hidden />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" aria-hidden />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" aria-hidden />
          <span className="ml-3 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
            Live
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {screenshot.panels.map((panel) => (
            <div key={panel.title} className="rounded-lg border border-border bg-card p-3">
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

        <div className="mt-3 h-28 rounded-lg border border-border bg-[linear-gradient(135deg,var(--muted),var(--card))] p-3">
          <div className="flex h-full items-end gap-1.5">
            {[42, 68, 51, 86, 60, 93, 72, 88, 64, 79].map((height, index) => (
              <span
                key={index}
                className="flex-1 rounded-t bg-accent/70"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      <figcaption className="mt-3 px-1 text-xs leading-5 text-muted-foreground">
        {screenshot.caption}
      </figcaption>
    </figure>
  );
}
