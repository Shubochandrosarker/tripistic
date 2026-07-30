import { BrandedShell } from "@/components/storefront/branded-shell";
import { resolvePublicBranding } from "@/lib/storefront/branding";

/**
 * Layout for a customer's own custom domain.
 *
 * Previously rendered a Tripistic logo, the word "Tripistic", and "Powered by
 * Tripistic" — on the operator's own domain, above and below their own
 * storefront. That is the single most visible place the white-label promise
 * could fail, and it was failing.
 */
export default async function HostedStorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const branding = await resolvePublicBranding();
  return <BrandedShell branding={branding}>{children}</BrandedShell>;
}
