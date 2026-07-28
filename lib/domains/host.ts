const DEFAULT_RESERVED_SUBDOMAINS = [
  "admin",
  "api",
  "app",
  "assets",
  "cdn",
  "dashboard",
  "docs",
  "help",
  "mail",
  "status",
  "support",
  "www",
];

export function platformRootDomain() {
  return (process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.ROOT_DOMAIN || "tripistic.com")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.+$/, "");
}

export function reservedSubdomains() {
  const raw = process.env.RESERVED_PLATFORM_HOSTS;
  if (!raw) return DEFAULT_RESERVED_SUBDOMAINS;
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  const first = input.split(",")[0]?.trim().toLowerCase();
  if (!first) return null;
  const withoutProtocol = first.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";
  const bracketless = withoutPath.startsWith("[") ? withoutPath : withoutPath.split(":")[0];
  const hostname = bracketless.replace(/^\[/, "").replace(/\]$/, "").replace(/\.+$/, "");
  if (!hostname || hostname.length > 253) return null;
  if (!/^[a-z0-9.-]+$/.test(hostname)) return null;
  if (hostname.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
    return null;
  }
  return hostname;
}

export function isIpv4(hostname: string) {
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

export function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local");
}

export function isPlatformHostname(hostname: string) {
  const root = platformRootDomain();
  return hostname === root || hostname.endsWith(`.${root}`);
}

export function platformSubdomain(hostname: string) {
  const root = platformRootDomain();
  if (!hostname.endsWith(`.${root}`)) return null;
  return hostname.slice(0, -(root.length + 1));
}

export function isReservedPlatformHostname(hostname: string) {
  const root = platformRootDomain();
  if (hostname === root || hostname === `www.${root}`) return true;
  const subdomain = platformSubdomain(hostname);
  return Boolean(subdomain && reservedSubdomains().includes(subdomain));
}

export function isCandidateStorefrontHost(hostname: string) {
  if (isLocalHostname(hostname) || isIpv4(hostname)) return false;
  if (isReservedPlatformHostname(hostname)) return false;
  return hostname.includes(".");
}

export function shouldBypassHostRewrite(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/workspaces") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/_host") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}
