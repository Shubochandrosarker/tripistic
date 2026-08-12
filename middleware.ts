import NextAuth from "next-auth";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import {
  isCandidateStorefrontHost,
  normalizeHostname,
  platformSubdomain,
  shouldBypassHostRewrite,
} from "@/lib/domains/host";
import { resolveHostMappingFromEdgeCache } from "@/lib/domains/edge-cache";
import { REQUEST_ID_HEADER, sanitizeRequestId } from "@/lib/observability/request-id";
import { STOREFRONT_SLUG_HEADER, storefrontSlugFromPath } from "@/lib/storefront/tenant-header";

const { auth } = NextAuth(authConfig);

/**
 * Stamps the storefront tenant onto the request so public layouts can brand
 * themselves.
 *
 * Layouts do not receive route params, and the host alone is not enough: a
 * storefront is reachable at `tripistic.com/book/<slug>` as well as through a
 * subdomain or custom-domain rewrite, and on the apex there is no host to
 * resolve from. Middleware is the one place that knows the tenant in every
 * case, so it resolves it once and passes it down.
 *
 * Always overwritten, never merged: an inbound `x-tripistic-storefront` from a
 * client would otherwise let anyone render another operator's brand — and, via
 * the white-label entitlement, remove our attribution from a page.
 */
function withStorefrontSlug(request: NextRequest, slug: string | null): Headers {
  const headers = new Headers(request.headers);
  headers.delete(STOREFRONT_SLUG_HEADER);
  if (slug) headers.set(STOREFRONT_SLUG_HEADER, slug);
  return headers;
}

function rewritePlatformSubdomain(request: NextRequest, slug: string) {
  const url = request.nextUrl.clone();
  const path = url.pathname === "/" ? "" : url.pathname;
  if (path.startsWith("/tours/")) {
    url.pathname = `/book/${slug}/${path.slice("/tours/".length)}`;
  } else {
    url.pathname = `/book/${slug}${path}`;
  }
  return NextResponse.rewrite(url, { request: { headers: withStorefrontSlug(request, slug) } });
}

function rewriteCustomHostname(request: NextRequest, hostname: string) {
  const url = request.nextUrl.clone();
  const path = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `/_host/${encodeURIComponent(hostname)}${path}`;
  // The hostname maps to a workspace, but resolving which one needs the
  // database, which Edge middleware should not reach for. The page under
  // /_host resolves it and the layout falls back to the host lookup.
  return NextResponse.rewrite(url, { request: { headers: withStorefrontSlug(request, null) } });
}

/**
 * Ensures every request carries a correlation id before any handler runs.
 *
 * Middleware runs on the Edge runtime, where `AsyncLocalStorage` is not
 * available — so this only establishes the *header*. Node-runtime handlers
 * wrapped in `withRequestContext` read it back and open the async context
 * from there. An inbound id is honoured when it passes `sanitizeRequestId`,
 * letting a load balancer own the trace; anything malformed is replaced,
 * because the value ends up in log lines and an unvalidated one would let a
 * caller forge them.
 */
function withRequestId(request: NextRequest, response: NextResponse): NextResponse {
  const requestId = sanitizeRequestId(request.headers.get(REQUEST_ID_HEADER)) ?? crypto.randomUUID();
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

/**
 * Session cookies cleared when a session read fails.
 *
 * Both the `__Secure-`/`__Host-` production names and the bare development
 * ones, because a cookie set under one prefix is not cleared by deleting the
 * other — and the whole point is that the browser stops sending the bad value.
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
] as const;

function clearSessionCookies(response: NextResponse): NextResponse {
  for (const name of SESSION_COOKIES) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
  return response;
}

/**
 * What Next.js actually calls middleware with.
 *
 * `auth()` is typed for App Route handlers, whose second argument carries
 * `params`; middleware receives a `NextFetchEvent` instead. The runtime shapes
 * are compatible — the wrapper only forwards the second argument — but the
 * types are not, so the call site is narrowed here rather than casting the
 * event at every use.
 */
type MiddlewareHandler = (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response | undefined> | Response | undefined;

const withAuth = auth((request) => {
  const hostname = normalizeHostname(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  if (hostname && !shouldBypassHostRewrite(request.nextUrl.pathname) && isCandidateStorefrontHost(hostname)) {
    const slug = platformSubdomain(hostname);
    if (slug) return withRequestId(request, rewritePlatformSubdomain(request, slug));
    return resolveHostMappingFromEdgeCache(hostname, request.nextUrl).then((mapping) => {
      if (!mapping.found) return withRequestId(request, rewriteCustomHostname(request, hostname));
      if (mapping.redirectTo) {
        const url = request.nextUrl.clone();
        url.hostname = mapping.redirectTo;
        url.protocol = "https:";
        return withRequestId(request, NextResponse.redirect(url, 308));
      }
      return withRequestId(request, rewritePlatformSubdomain(request, mapping.workspaceSlug));
    });
  }
  // Direct `/book/<slug>/...` on the apex domain — no rewrite happened, so
  // the slug comes from the path. Also the shape every localhost run takes.
  return withRequestId(
    request,
    NextResponse.next({
      request: { headers: withStorefrontSlug(request, storefrontSlugFromPath(request.nextUrl.pathname)) },
    }),
  );
}) as unknown as MiddlewareHandler;

/**
 * Fail-soft shell around the session read.
 *
 * **This is defence in depth, not a fix for an observed bug.** The remediation
 * brief attributed the production lockout to NextAuth v5 throwing
 * `JWTSessionError` on an undecryptable cookie inside Edge middleware whose
 * matcher covers `/login` — which would 500 the one page a locked-out user
 * needs. That was tested here against `next-auth@5.0.0-beta.32` by minting a
 * valid JWE under one `AUTH_SECRET` and serving under another: the library
 * clears the session cookie and treats it as no session, and `/login`,
 * `/dashboard` and `/admin` answered 200/307/307 both with and without this
 * wrapper. The throw does not happen on this version.
 *
 * The wrapper is kept anyway because the failure mode it guards is
 * catastrophic and asymmetric: one `try` costs nothing, while any future throw
 * from the session read — a beta bump, a different error class, an Edge crypto
 * failure — locks every user out of the login page with no route to recovery,
 * because the bad cookie is sent with the very request that would replace it.
 *
 * Two behaviours, and both matter:
 *
 *   - On `/login` it **clears the cookies and continues**. Redirecting to
 *     `/login` from `/login` is an infinite loop, which is worse than the 500
 *     it replaces.
 *   - Everywhere else it **clears and redirects to `/login`**, with
 *     `?reauth=1` so the page can explain itself.
 *
 * Only the error's name and the path are logged. The cookie value is the
 * credential, and `cause` on a decryption error can carry fragments of it.
 */
export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  try {
    return await withAuth(request, event);
  } catch (error) {
    // `console.error`, not the structured logger: that module imports
    // `node:async_hooks`, which the Edge runtime cannot load. One JSON line
    // keeps it queryable anyway.
    console.error(
      JSON.stringify({
        event: "middleware.session_read_failed",
        errorName: error instanceof Error ? error.name : "unknown",
        path: request.nextUrl.pathname,
      }),
    );

    if (request.nextUrl.pathname.startsWith("/login")) {
      return clearSessionCookies(
        withRequestId(request, NextResponse.next({ request: { headers: request.headers } })),
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("reauth", "1");
    return clearSessionCookies(withRequestId(request, NextResponse.redirect(url)));
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
