import crypto from "node:crypto";
import dns from "node:dns/promises";
import { badRequest, conflict, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  isIpv4,
  isLocalHostname,
  isPlatformHostname,
  normalizeHostname,
  platformRootDomain,
} from "@/lib/domains/host";
import { getCustomHostnameProvider, providerErrorsJson, type ProviderHostname } from "@/lib/domains/provider";
import { assertCanAddCustomDomain } from "@/lib/plans/entitlements";

const MIN_DOMAIN_LABELS = 2;

export function expectedCnameTarget() {
  return (process.env.CUSTOM_DOMAIN_CNAME_TARGET || `cname.${platformRootDomain()}`)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
}

export function txtRecordName(hostname: string) {
  return `_tripistic.${hostname}`;
}

export function isApexHostname(hostname: string) {
  return hostname.split(".").length === 2;
}

export function defaultApexRedirect(hostname: string) {
  return isApexHostname(hostname) ? `www.${hostname}` : null;
}

export function validateCustomHostname(input: string) {
  const hostname = normalizeHostname(input);
  if (!hostname) throw badRequest("Enter a valid hostname.");
  if (isLocalHostname(hostname) || isIpv4(hostname) || hostname.includes(":")) {
    throw badRequest("IP addresses, localhost, and local network names cannot be used.");
  }
  if (isPlatformHostname(hostname)) {
    throw badRequest("Tripistic-owned hostnames cannot be claimed as custom domains.");
  }
  const labels = hostname.split(".");
  if (labels.length < MIN_DOMAIN_LABELS || labels[labels.length - 1].length < 2) {
    throw badRequest("Enter a full hostname such as www.example.com.");
  }
  return hostname;
}

function verificationToken() {
  return `tripistic-domain-verification=${crypto.randomBytes(24).toString("base64url")}`;
}

function normalizeDnsTarget(value: string) {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

async function hasTxtRecord(hostname: string, expected: string) {
  try {
    const records = await dns.resolveTxt(txtRecordName(hostname));
    return records.some((parts) => parts.join("") === expected);
  } catch {
    return false;
  }
}

async function hasCnameRecord(hostname: string, expected: string) {
  try {
    const records = await dns.resolveCname(hostname);
    return records.map(normalizeDnsTarget).includes(normalizeDnsTarget(expected));
  } catch {
    return false;
  }
}

function providerUpdate(providerHostname: ProviderHostname) {
  return {
    providerStatus: providerHostname.status,
    providerSslStatus: providerHostname.sslStatus,
    providerTxtName: providerHostname.verificationName ?? undefined,
    providerTxtValue: providerHostname.verificationValue ?? undefined,
    providerHttpUrl: providerHostname.httpUrl ?? undefined,
    providerHttpBody: providerHostname.httpBody ?? undefined,
    providerErrors: providerErrorsJson(providerHostname.errors),
  };
}

function statusFromHealth({
  txtOk,
  cnameOk,
  providerHostname,
  apex,
}: {
  txtOk: boolean;
  cnameOk: boolean;
  providerHostname: ProviderHostname;
  apex: boolean;
}) {
  const dnsOk = txtOk && (cnameOk || apex);
  if (!dnsOk) return "pending_dns" as const;
  if (providerHostname.status === "failed" || providerHostname.sslStatus === "failed") return "failed" as const;
  if (providerHostname.status === "active" && providerHostname.sslStatus === "active") return "active" as const;
  return "ssl_pending" as const;
}

export async function createCustomDomain({
  workspaceId,
  hostname: input,
  redirectToWww = false,
}: {
  workspaceId: string;
  hostname: string;
  redirectToWww?: boolean;
}) {
  const hostname = validateCustomHostname(input);
  await assertCanAddCustomDomain(workspaceId);

  const existing = await prisma.customDomain.findUnique({ where: { hostname } });
  if (existing && existing.workspaceId !== workspaceId) {
    throw conflict("This hostname is already claimed.");
  }
  if (existing && existing.status !== "disabled") {
    throw conflict("This hostname is already configured for this workspace.");
  }

  const expectedCname = expectedCnameTarget();
  const token = verificationToken();
  const provider = getCustomHostnameProvider();
  const providerHostname = await provider.create(hostname);
  const redirectTo = redirectToWww ? defaultApexRedirect(hostname) : null;
  return prisma.customDomain.upsert({
    where: { hostname },
    create: {
      workspaceId,
      hostname,
      expectedCname,
      verificationToken: token,
      provider: provider.name,
      providerHostnameId: providerHostname.id,
      redirectTo,
      ...providerUpdate(providerHostname),
      cacheInvalidatedAt: new Date(),
      lastCheckMessage: providerHostname.message ?? `Add CNAME ${hostname} -> ${expectedCname} and TXT ${txtRecordName(hostname)} = ${token}.`,
    },
    update: {
      workspaceId,
      status: "pending_dns",
      expectedCname,
      verificationToken: token,
      provider: provider.name,
      providerHostnameId: providerHostname.id,
      redirectTo,
      ...providerUpdate(providerHostname),
      cacheInvalidatedAt: new Date(),
      verifiedAt: null,
      sslIssuedAt: null,
      lastCheckedAt: null,
      lastCheckMessage: providerHostname.message ?? `Add CNAME ${hostname} -> ${expectedCname} and TXT ${txtRecordName(hostname)} = ${token}.`,
    },
  });
}

export async function verifyCustomDomain({
  workspaceId,
  domainId,
}: {
  workspaceId: string;
  domainId: string;
}) {
  const domain = await prisma.customDomain.findFirst({ where: { id: domainId, workspaceId } });
  if (!domain) throw notFound("Domain not found.");
  if (domain.status === "disabled") throw conflict("This domain is disabled.");

  const [txtOk, cnameOk] = await Promise.all([
    hasTxtRecord(domain.hostname, domain.verificationToken),
    hasCnameRecord(domain.hostname, domain.expectedCname),
  ]);
  const now = new Date();
  const provider = getCustomHostnameProvider();
  const providerHostname = domain.providerHostnameId
    ? await provider.get(domain.providerHostnameId)
    : await provider.create(domain.hostname);
  const apex = isApexHostname(domain.hostname);
  const status = statusFromHealth({ txtOk, cnameOk, providerHostname, apex });
  if (!txtOk || (!cnameOk && !apex)) {
    return prisma.customDomain.update({
      where: { id: domain.id },
      data: {
        status: "pending_dns",
        provider: provider.name,
        providerHostnameId: providerHostname.id,
        ...providerUpdate(providerHostname),
        lastCheckedAt: now,
        cacheInvalidatedAt: now,
        lastCheckMessage: `${txtOk ? "TXT verified" : "TXT missing"}; ${cnameOk || apex ? "Routing target accepted" : "CNAME missing"}. ${providerHostname.message ?? ""}`.trim(),
      },
    });
  }

  return prisma.customDomain.update({
    where: { id: domain.id },
    data: {
      status,
      provider: provider.name,
      providerHostnameId: providerHostname.id,
      ...providerUpdate(providerHostname),
      verifiedAt: domain.verifiedAt ?? now,
      sslIssuedAt: providerHostname.sslStatus === "active" ? (domain.sslIssuedAt ?? now) : domain.sslIssuedAt,
      lastCheckedAt: now,
      cacheInvalidatedAt: now,
      lastCheckMessage: providerHostname.message ?? (status === "active" ? "Domain active with provider TLS." : "DNS verified; waiting for TLS provider activation."),
    },
  });
}

export async function markDomainActive({
  workspaceId,
  domainId,
}: {
  workspaceId: string;
  domainId: string;
}) {
  const domain = await prisma.customDomain.findFirst({ where: { id: domainId, workspaceId } });
  if (!domain) throw notFound("Domain not found.");
  if (!domain.verifiedAt) throw conflict("Verify DNS before activating this domain.");
  if (domain.provider === "cloudflare" && (domain.providerStatus !== "active" || domain.providerSslStatus !== "active")) {
    throw conflict("Cloudflare must report hostname and SSL active before activation.");
  }
  const now = new Date();
  return prisma.customDomain.update({
    where: { id: domain.id },
    data: {
      status: "active",
      sslIssuedAt: domain.sslIssuedAt ?? now,
      lastCheckedAt: now,
      cacheInvalidatedAt: now,
      lastCheckMessage: "Domain marked active after provider TLS confirmation.",
    },
  });
}

export async function disableCustomDomain({ workspaceId, domainId }: { workspaceId: string; domainId: string }) {
  const domain = await prisma.customDomain.findFirst({ where: { id: domainId, workspaceId } });
  if (!domain) throw notFound("Domain not found.");
  const provider = getCustomHostnameProvider();
  if (domain.providerHostnameId && domain.provider === provider.name) {
    await provider.remove(domain.providerHostnameId).catch((error) => {
      console.warn("[domains] provider remove failed", domain.hostname, error);
    });
  }
  return prisma.customDomain.update({
    where: { id: domain.id },
    data: {
      status: "disabled",
      providerStatus: "disabled",
      cacheInvalidatedAt: new Date(),
      lastCheckedAt: new Date(),
      lastCheckMessage: "Domain disabled by workspace admin.",
    },
  });
}

export async function pollCustomDomainHealth(limit = 50) {
  const domains = await prisma.customDomain.findMany({
    where: { status: { in: ["pending_dns", "verifying", "verified", "ssl_pending", "active", "failed"] } },
    orderBy: [{ lastCheckedAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
  let checked = 0;
  let active = 0;
  let failed = 0;
  for (const domain of domains) {
    try {
      const updated = await verifyCustomDomain({ workspaceId: domain.workspaceId, domainId: domain.id });
      checked += 1;
      if (updated.status === "active") active += 1;
      if (updated.status === "failed") failed += 1;
    } catch (error) {
      checked += 1;
      failed += 1;
      await prisma.customDomain.update({
        where: { id: domain.id },
        data: {
          status: "failed",
          lastCheckedAt: new Date(),
          cacheInvalidatedAt: new Date(),
          lastCheckMessage: error instanceof Error ? error.message : "Domain health check failed.",
        },
      });
    }
  }
  return { checked, active, failed };
}

export async function resolveActiveCustomDomain(hostnameInput: string) {
  const hostname = normalizeHostname(hostnameInput);
  if (!hostname) return null;
  return prisma.customDomain.findFirst({
    where: {
      OR: [{ hostname }, { redirectTo: hostname }],
      status: "active",
      workspace: { status: "active", deletedAt: null },
    },
    include: { workspace: { select: { id: true, slug: true, name: true } } },
  });
}
