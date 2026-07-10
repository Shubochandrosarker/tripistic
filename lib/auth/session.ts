import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { unauthorized } from "@/lib/api";
import { auth } from "./auth";

/** Session claims (JWT) — cheap, but treat as a hint for anything security-critical. */
export const getSessionUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
});

/**
 * Full user row, re-verified against the database (active + not deleted).
 * Cached per request so layout + page share one query.
 */
export const getCurrentUser = cache(async () => {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  const user = await prisma.user.findFirst({
    where: { id: sessionUser.id, deletedAt: null, status: "active" },
  });
  return user;
});

/** For pages/layouts: redirect to login when unauthenticated. */
export async function requireUserPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For API handlers: throw 401 when unauthenticated. */
export async function requireUserApi() {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}
