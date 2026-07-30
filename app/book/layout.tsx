import { BrandedShell } from "@/components/storefront/branded-shell";
import { resolvePublicBranding } from "@/lib/storefront/branding";

/**
 * Layout for the platform-subdomain storefront and the whole booking journey
 * beneath it — tour pages, checkout, and the confirmation a guest lands on
 * after paying.
 *
 * `resolvePublicBranding` returns null when the host maps to no workspace
 * (someone browsing `/book/...` on the apex domain), and the shell falls back
 * to Tripistic's own identity — so an operator's brand can never leak onto a
 * page that is not theirs.
 */
export default async function BookLayout({ children }: { children: React.ReactNode }) {
  const branding = await resolvePublicBranding();
  return (
    <BrandedShell branding={branding} width="narrow">
      {children}
    </BrandedShell>
  );
}
