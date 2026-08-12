/**
 * Cloudflare configuration resolution.
 *
 * Every Cloudflare capability Tripistic uses is optional. A deployment with
 * no Cloudflare account at all must boot, serve every existing route, and
 * report the unconfigured services as "not configured" rather than as
 * failures — the V3 brief is explicit about this, and it is also the only
 * honest thing to do: a missing account credential is not an application
 * defect.
 *
 * So configuration is resolved per capability, not globally. Custom hostnames
 * need a zone; Workers for Platforms needs an account and a dispatch
 * namespace; Vectorize needs an index name. Having one does not imply having
 * another, and a half-configured account should light up exactly the features
 * it can support.
 *
 * Nothing here reads a secret into a return value. `token()` is deliberately
 * separate and is only ever called by the HTTP client immediately before it
 * builds an Authorization header, so a config object can be logged or handed
 * to an admin health view without a redaction pass.
 */

export type CloudflareCapability =
  | "account"
  | "customHostnames"
  | "workersForPlatforms"
  | "r2"
  | "vectorize"
  | "aiGateway"
  | "workersAi";

export type CloudflareEnvironment = "development" | "staging" | "production";

function read(key: string): string | undefined {
  const value = process.env[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Which named Cloudflare environment this deployment acts against.
 *
 * Resource names are suffixed with it (`tripistic-sites-staging`), which is
 * the whole point: the brief requires that domain lifecycle and payment
 * changes are never first exercised against production customers, and the
 * cheapest enforcement of that is making the production namespace impossible
 * to hit by accident from a staging box.
 *
 * Defaults to `development` rather than `production`. A missing variable
 * should not silently point a developer's machine at the live dispatch
 * namespace.
 */
export function cloudflareEnvironment(): CloudflareEnvironment {
  const explicit = read("CLOUDFLARE_ENVIRONMENT");
  if (explicit === "staging" || explicit === "production" || explicit === "development") {
    return explicit;
  }
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/** `tripistic-sites` -> `tripistic-sites-staging`. Naming per the V3 brief. */
export function cloudflareResourceName(base: string): string {
  return `${base}-${cloudflareEnvironment()}`;
}

export type CloudflareConfig = {
  accountId?: string;
  zoneId?: string;
  customHostnameZoneId?: string;
  dcvMethod: string;
  dispatchNamespace?: string;
  sitesRootDomain?: string;
  previewDomain?: string;
  r2Bucket?: string;
  vectorizeIndex?: string;
  aiGatewayId?: string;
  aiGatewayAccountId?: string;
  aiSearchInstance?: string;
  environment: CloudflareEnvironment;
};

export function cloudflareConfig(): CloudflareConfig {
  return {
    accountId: read("CLOUDFLARE_ACCOUNT_ID"),
    zoneId: read("CLOUDFLARE_ZONE_ID"),
    // Custom hostnames may live in a different zone from the app's own DNS.
    // Falls back to the main zone so existing single-zone deployments keep
    // working with no new variables.
    customHostnameZoneId: read("CLOUDFLARE_CUSTOM_HOSTNAME_ZONE_ID") ?? read("CLOUDFLARE_ZONE_ID"),
    dcvMethod: read("CLOUDFLARE_CUSTOM_HOSTNAME_DCV_METHOD") ?? "txt",
    dispatchNamespace: read("CLOUDFLARE_DISPATCH_NAMESPACE"),
    sitesRootDomain: read("CLOUDFLARE_SITES_ROOT_DOMAIN"),
    previewDomain: read("CLOUDFLARE_PREVIEW_DOMAIN"),
    r2Bucket: read("CLOUDFLARE_R2_BUCKET"),
    vectorizeIndex: read("CLOUDFLARE_VECTORIZE_INDEX"),
    aiGatewayId: read("CLOUDFLARE_AI_GATEWAY_ID"),
    aiGatewayAccountId: read("CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID") ?? read("CLOUDFLARE_ACCOUNT_ID"),
    aiSearchInstance: read("CLOUDFLARE_AI_SEARCH_INSTANCE"),
    environment: cloudflareEnvironment(),
  };
}

/** The API token. Never returned as part of `cloudflareConfig()`. */
export function cloudflareApiToken(): string | undefined {
  return read("CLOUDFLARE_API_TOKEN");
}

/**
 * The AI Gateway's own "Authenticated Gateway" token.
 *
 * Separate from `cloudflareApiToken()` on purpose — it authenticates against
 * a single gateway's `cf-aig-authorization` header, not the account-wide
 * Cloudflare REST API, and a deployment can have one without the other.
 * Never returned as part of `cloudflareConfig()`, for the same reason
 * `cloudflareApiToken()` isn't: only the HTTP client should read it,
 * immediately before building the header.
 */
export function aiGatewayToken(): string | undefined {
  return read("CLOUDFLARE_AI_GATEWAY_TOKEN");
}

export function isCloudflareCapabilityConfigured(capability: CloudflareCapability): boolean {
  const config = cloudflareConfig();
  const hasToken = Boolean(cloudflareApiToken());

  switch (capability) {
    case "account":
      return hasToken && Boolean(config.accountId);
    case "customHostnames":
      return hasToken && Boolean(config.customHostnameZoneId);
    case "workersForPlatforms":
      return hasToken && Boolean(config.accountId && config.dispatchNamespace);
    case "r2":
      return hasToken && Boolean(config.accountId && config.r2Bucket);
    case "vectorize":
      return hasToken && Boolean(config.accountId && config.vectorizeIndex);
    case "aiGateway":
      return Boolean(config.aiGatewayAccountId && config.aiGatewayId);
    case "workersAi":
      return hasToken && Boolean(config.accountId);
  }
}

/**
 * The hostname a published site is served from on the Tripistic-owned domain.
 *
 * Separate from `ROOT_DOMAIN` on purpose. Sites live on a different apex
 * (`business.tripistic.site`) from the application (`app.tripistic.com`) so
 * that tenant-authored content can never share an origin — and therefore
 * never share cookies — with the dashboard.
 */
export function siteSubdomainHostname(subdomain: string): string | null {
  const root = cloudflareConfig().sitesRootDomain;
  if (!root) return null;
  return `${subdomain}.${root}`;
}

export function previewHostname(deploymentId: string): string | null {
  const root = cloudflareConfig().previewDomain;
  if (!root) return null;
  return `preview-${deploymentId}.${root}`;
}
