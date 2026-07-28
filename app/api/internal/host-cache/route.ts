import { NextResponse } from "next/server";
import { normalizeHostname } from "@/lib/domains/host";
import { resolveActiveCustomDomain } from "@/lib/domains/service";

function authorized(request: Request) {
  const expected = process.env.HOSTNAME_CACHE_SECRET || process.env.CRON_SECRET;
  return Boolean(expected && request.headers.get("x-tripistic-internal-secret") === expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const hostname = searchParams.get("hostname");
  if (!hostname) return NextResponse.json({ found: false });

  const domain = await resolveActiveCustomDomain(hostname);
  if (!domain) return NextResponse.json({ found: false });
  const normalized = normalizeHostname(hostname);

  return NextResponse.json(
    {
      found: true,
      workspaceSlug: domain.workspace.slug,
      redirectTo: normalized === domain.hostname ? domain.redirectTo : null,
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
