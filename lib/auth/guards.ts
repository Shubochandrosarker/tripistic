import { notFound as pageNotFound, redirect } from "next/navigation";
import { notFound } from "@/lib/api";
import { getCurrentUser } from "./session";

/**
 * Page guard for /admin/** — platform admin verified against the database on
 * every request (revoked admins are locked out even with a live JWT).
 * Renders a 404 for non-admins so the admin surface is not advertised.
 */
export async function requirePlatformAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isPlatformAdmin) pageNotFound();
  return user;
}

/** API guard for /api/admin/** — 404 semantics for non-admins. */
export async function requirePlatformAdminApi() {
  const user = await getCurrentUser();
  if (!user || !user.isPlatformAdmin) throw notFound();
  return user;
}
