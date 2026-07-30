import { BrandedShell } from "@/components/storefront/branded-shell";
import { resolvePublicBranding } from "@/lib/storefront/branding";

/**
 * Layout for a shared itinerary.
 *
 * A guest opens this from a link the operator sent them, so it is the
 * operator's document rather than ours — the same white-label reasoning as
 * the storefront and booking journey.
 */
export default async function ItineraryLayout({ children }: { children: React.ReactNode }) {
  const branding = await resolvePublicBranding();
  return (
    <BrandedShell branding={branding} width="narrow" hideChromeOnPrint>
      {children}
    </BrandedShell>
  );
}
