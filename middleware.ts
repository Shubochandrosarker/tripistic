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

export default auth((request) => {
  const hostname = normalizeHostname(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  if (hostname && !shouldBypassHostRewrite(request.nextUrl.pathname) && isCandidateStorefrontHost(hostname)) {
    const slug = platformSubdomain(hostname);
    if (slug) return rewritePlatformSubdomain(request, slug);
    return resolveHostMappingFromEdgeCache(hostname, request.nextUrl).then((mapping) => {
      if (!mapping.found) return rewriteCustomHostname(request, hostname);
      if (mapping.redirectTo) {
        const url = request.nextUrl.clone();
        url.hostname = mapping.redirectTo;
        url.protocol = "https:";
        return NextResponse.redirect(url, 308);
      }
      return rewritePlatformSubdomain(request, mapping.workspaceSlug);
    });
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
