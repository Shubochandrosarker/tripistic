/**
 * Storefront tenant resolution that is safe on the Edge runtime.
 *
 * Kept free of Node built-ins and of any database access so `middleware.ts`
 * can import it. The header it defines is how a public layout learns which
 * operator's brand to render — see `lib/storefront/branding.ts`.
 */

export const STOREFRONT_SLUG_HEADER = "x-tripistic-storefront";

/** Workspace slugs are lowercase, hyphenated, and bounded. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Extracts the workspace slug from a `/book/<slug>/...` path.
 *
 * Returns null for `/book/confirmation/...`, which is keyed by a public
 * booking token rather than a workspace — treating "confirmation" as a slug
 * would send the layout looking up a workspace that does not exist.
 */
export function storefrontSlugFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "book") return null;
  const candidate = parts[1];
  if (!candidate || candidate === "confirmation") return null;
  return SLUG.test(candidate) ? candidate : null;
}
