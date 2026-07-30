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
  if (!user) return null;

  // Sessions are stateless JWTs, so there is no server-side record to delete
  // when every session must stop working. The version is stamped into the
  // token at sign-in and compared here: a password reset increments the column,
  // and every token issued before it stops resolving to a user. Without this,
  // someone resetting their password because an attacker had it would leave
  // that attacker signed in — the reset would feel like it worked and change
  // nothing.
  const tokenVersion = sessionUser.sessionVersion ?? 0;
  if (tokenVersion !== user.sessionVersion) return null;

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
