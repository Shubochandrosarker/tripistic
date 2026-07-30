import Link from "next/link";
import { Compass } from "lucide-react";

import { brandingCssVariables, type PublicBranding } from "@/lib/storefront/branding";

/**
 * Header and footer for the public guest journey.
 *
 * Renders the operator's brand when one can be resolved, and Tripistic's own
 * only when it cannot — the marketing site, or a host that maps to no
 * workspace. Before this, an operator's custom domain showed a Tripistic logo
 * above their storefront and "Powered by Tripistic" below it, which is the
 * white-label feature not working.
 *
 * The palette is set on the outer element rather than inside the storefront
 * body, so the tour page, the booking form and the post-payment confirmation
 * inherit it too. A guest who sees the operator's colours on the landing page
 * and the vendor's on the checkout has not been shown a white-labelled
 * product.
 */
export function BrandedShell({
  branding,
  width = "wide",
  hideChromeOnPrint = false,
  children,
}: {
  branding: PublicBranding | null;
  width?: "wide" | "narrow";
  /** Itineraries are printed by guests; the header and footer are screen furniture there. */
  hideChromeOnPrint?: boolean;
  children: React.ReactNode;
}) {
  const maxWidth = width === "narrow" ? "max-w-3xl" : "max-w-5xl";
  const chrome = hideChromeOnPrint ? " print:hidden" : "";
  const showAttribution = branding ? branding.showPlatformAttribution : true;

  return (
    <div
      className="flex min-h-dvh flex-col bg-background"
      style={branding ? brandingCssVariables(branding) : undefined}
    >
      <header className={`border-b border-border${chrome}`}>
        <div className={`mx-auto flex ${maxWidth} items-center gap-2 px-4 py-4`}>
          <Link href="/" className="flex items-center gap-2">
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={`${branding.brandName} logo`}
                className="max-h-8 w-fit max-w-40 object-contain"
              />
            ) : (
              <span
                className="flex size-8 items-center justify-center rounded-lg text-accent-foreground"
                style={{ background: branding ? "var(--storefront-primary)" : undefined }}
              >
                <Compass className="size-4" aria-hidden />
              </span>
            )}
            <span className="text-sm font-semibold tracking-tight text-foreground">
              {branding?.brandName ?? "Tripistic"}
            </span>
          </Link>
        </div>
      </header>

      <main id="main" className={`mx-auto w-full ${maxWidth} flex-1 px-4 py-8`}>
        {children}
      </main>

      <footer className={`border-t border-border py-6 text-center text-xs text-muted-foreground${chrome}`}>
        {showAttribution ? (
          <span>Powered by Tripistic</span>
        ) : (
          // Not an empty footer: the operator's own name is what belongs here
          // once the vendor's is gone.
          <span>{branding?.brandName}</span>
        )}
      </footer>
    </div>
  );
}
