import { cookies } from "next/headers";

/**
 * The anonymous advisor session.
 *
 * A visitor to the public Travel Advisor has no account, but still needs their
 * thread to survive a page reload and to be convertible into a real account
 * later. That handle is a high-entropy token on `AiConversation.publicToken`.
 *
 * Where the token lives matters more than it first appears. It is kept in an
 * httpOnly cookie rather than in `localStorage` or a URL, for three reasons:
 *
 *   - **httpOnly** means an XSS on a marketing page cannot read it and walk
 *     into the visitor's conversation.
 *   - **Not in the URL** means it does not end up in a `Referer` header, a
 *     shared link, or an analytics pathname — all of which are places a
 *     bearer credential must never appear.
 *   - **`sameSite: lax`** still allows the cookie on a top-level navigation
 *     back from a checkout or an email link, which is the flow that turns an
 *     advisor session into a signup.
 *
 * The cookie is not a login. It authorises exactly one anonymous conversation
 * and nothing else; every read path checks that the resolved conversation has
 * no `workspaceId`, so a token can never address tenant data.
 */

export const PUBLIC_ADVISOR_COOKIE = "tripistic.advisor";

/** Long enough to plan a trip across several visits, short enough to expire. */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function readAdvisorToken(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(PUBLIC_ADVISOR_COOKIE)?.value?.trim();
  return value && value.length >= 20 ? value : null;
}

export function advisorCookieAttributes(): string {
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function setAdvisorCookieHeader(token: string): string {
  return `${PUBLIC_ADVISOR_COOKIE}=${token}; ${advisorCookieAttributes()}`;
}

export function clearAdvisorCookieHeader(): string {
  const attributes = advisorCookieAttributes().replace(/Max-Age=\d+/, "Max-Age=0");
  return `${PUBLIC_ADVISOR_COOKIE}=; ${attributes}`;
}
