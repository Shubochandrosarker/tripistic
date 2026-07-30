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

const { auth } = NextAuth(authConfig);

function rewritePlatformSubdomain(request: NextRequest, slug: string) {
  const url = request.nextUrl.clone();
  const path = url.pathname === "/" ? "" : url.pathname;
  if (path.startsWith("/tours/")) {
    url.pathname = `/book/${slug}/${path.slice("/tours/".length)}`;
  } else {
    url.pathname = `/book/${slug}${path}`;
  }
  return NextResponse.rewrite(url);
}

function rewriteCustomHostname(request: NextRequest, hostname: string) {
  const url = request.nextUrl.clone();
  const path = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `/_host/${encodeURIComponent(hostname)}${path}`;
  return NextResponse.rewrite(url);
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
  return withRequestId(request, NextResponse.next());
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
