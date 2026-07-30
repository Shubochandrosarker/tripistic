import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
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

export default auth((request) => {
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
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
