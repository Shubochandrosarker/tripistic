import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cloudflareEnvironment,
  cloudflareResourceName,
  isCloudflareCapabilityConfigured,
  previewHostname,
  siteSubdomainHostname,
} from "@/lib/cloudflare/config";
import { buildTenantFilter, vectorId } from "@/lib/cloudflare/vectorize";
import { gatewayBaseUrl, gatewayHeaders, isCacheableIntent } from "@/lib/cloudflare/ai-gateway";

const CLOUDFLARE_KEYS = [
  "CLOUDFLARE_ENVIRONMENT",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ZONE_ID",
  "CLOUDFLARE_CUSTOM_HOSTNAME_ZONE_ID",
  "CLOUDFLARE_DISPATCH_NAMESPACE",
  "CLOUDFLARE_SITES_ROOT_DOMAIN",
  "CLOUDFLARE_PREVIEW_DOMAIN",
  "CLOUDFLARE_R2_BUCKET",
  "CLOUDFLARE_VECTORIZE_INDEX",
  "CLOUDFLARE_AI_GATEWAY_ID",
  "CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID",
  "CLOUDFLARE_AI_GATEWAY_TOKEN",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(CLOUDFLARE_KEYS.map((key) => [key, process.env[key]]));
  for (const key of CLOUDFLARE_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of CLOUDFLARE_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("cloudflare capability detection", () => {
  /**
   * The property that keeps a Cloudflare-less deployment working: every
   * capability reports "not configured" rather than throwing, and having one
   * capability never implies having another.
   */
  it("reports every capability unconfigured when nothing is set", () => {
    for (const capability of [
      "account",
      "customHostnames",
      "workersForPlatforms",
      "r2",
      "vectorize",
      "aiGateway",
      "workersAi",
    ] as const) {
      expect(isCloudflareCapabilityConfigured(capability)).toBe(false);
    }
  });

  it("does not enable Workers for Platforms from an account id alone", () => {
    process.env.CLOUDFLARE_API_TOKEN = "token";
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    expect(isCloudflareCapabilityConfigured("account")).toBe(true);
    expect(isCloudflareCapabilityConfigured("workersForPlatforms")).toBe(false);

    process.env.CLOUDFLARE_DISPATCH_NAMESPACE = "tripistic-sites-staging";
    expect(isCloudflareCapabilityConfigured("workersForPlatforms")).toBe(true);
  });

  it("does not enable any account capability without a token", () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    process.env.CLOUDFLARE_VECTORIZE_INDEX = "tripistic-rag";
    expect(isCloudflareCapabilityConfigured("vectorize")).toBe(false);
  });

  it("falls back to the main zone for custom hostnames", () => {
    process.env.CLOUDFLARE_API_TOKEN = "token";
    process.env.CLOUDFLARE_ZONE_ID = "zone";
    expect(isCloudflareCapabilityConfigured("customHostnames")).toBe(true);
  });

  it("treats the AI gateway as configured without an API token", () => {
    // The gateway is addressed by URL, not by the management API, so it works
    // for a deployment that has a gateway but no account-scoped token.
    process.env.CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_AI_GATEWAY_ID = "tripistic";
    expect(isCloudflareCapabilityConfigured("aiGateway")).toBe(true);
  });
});

describe("environment naming", () => {
  it("defaults to development rather than production", () => {
    expect(cloudflareEnvironment()).toBe("development");
  });

  it("honours an explicit environment", () => {
    process.env.CLOUDFLARE_ENVIRONMENT = "staging";
    expect(cloudflareEnvironment()).toBe("staging");
    expect(cloudflareResourceName("tripistic-sites")).toBe("tripistic-sites-staging");
  });

  it("ignores an unrecognised environment value", () => {
    process.env.CLOUDFLARE_ENVIRONMENT = "prod";
    expect(cloudflareEnvironment()).toBe("development");
  });
});

describe("site hostnames", () => {
  it("returns null when no sites root domain is configured", () => {
    expect(siteSubdomainHostname("acme")).toBeNull();
    expect(previewHostname("dep_1")).toBeNull();
  });

  it("builds subdomain and preview hostnames", () => {
    process.env.CLOUDFLARE_SITES_ROOT_DOMAIN = "tripistic.site";
    process.env.CLOUDFLARE_PREVIEW_DOMAIN = "preview.tripistic.site";
    expect(siteSubdomainHostname("acme")).toBe("acme.tripistic.site");
    expect(previewHostname("dep_1")).toBe("preview-dep_1.preview.tripistic.site");
  });
});

describe("vectorize tenant filter", () => {
  /**
   * Mandatory per the V3 brief: tenant isolation lives in the retrieval
   * filter, never in a prompt instruction.
   */
  it("scopes a private query to one workspace and to private visibility", () => {
    expect(buildTenantFilter({ visibility: "private", workspaceId: "ws_a" })).toEqual({
      workspaceId: { $eq: "ws_a" },
      visibility: { $eq: "private" },
    });
  });

  it("refuses a private query with no workspace", () => {
    expect(() =>
      buildTenantFilter({ visibility: "private", workspaceId: "" } as never),
    ).toThrow(/requires a workspaceId/);
  });

  it("does not put a workspace filter on global or public scopes", () => {
    expect(buildTenantFilter({ visibility: "global" })).toEqual({
      visibility: { $eq: "global" },
    });
    expect(buildTenantFilter({ visibility: "public" })).toEqual({
      visibility: { $eq: "public" },
    });
  });

  it("derives stable vector ids so a reindex overwrites rather than duplicates", () => {
    expect(vectorId("doc_1", 0)).toBe("doc_1:0");
    expect(vectorId("doc_1", 0)).toBe(vectorId("doc_1", 0));
    expect(vectorId("doc_1", 1)).not.toBe(vectorId("doc_1", 0));
  });
});

describe("ai gateway", () => {
  it("returns no base url when unconfigured", () => {
    expect(gatewayBaseUrl("openai")).toBeNull();
  });

  it("builds a provider base url", () => {
    process.env.CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_AI_GATEWAY_ID = "tripistic";
    expect(gatewayBaseUrl("workers-ai")).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct/tripistic/workers-ai",
    );
  });

  /**
   * Cloudflare's own guidance warns that a RAG/indexing gateway needs care
   * with caching. A cached embedding shared across tenants would be a
   * cross-tenant data path, so only public chat is ever cacheable.
   */
  it("caches only public chat", () => {
    expect(isCacheableIntent("public_chat")).toBe(true);
    for (const intent of [
      "workspace_chat",
      "rag_answer",
      "embedding",
      "content_generation",
      "classification",
    ] as const) {
      expect(isCacheableIntent(intent)).toBe(false);
    }
  });

  it("skips the cache for embeddings and sets a ttl for public chat", () => {
    expect(gatewayHeaders({ intent: "embedding" })["cf-aig-skip-cache"]).toBe("true");
    expect(gatewayHeaders({ intent: "embedding" })["cf-aig-cache-ttl"]).toBeUndefined();
    expect(gatewayHeaders({ intent: "public_chat" })["cf-aig-cache-ttl"]).toBe("3600");
  });

  it("puts identifiers but never content into gateway metadata", () => {
    const headers = gatewayHeaders({
      intent: "workspace_chat",
      workspaceId: "ws_a",
      surface: "workspace_copilot",
    });
    expect(JSON.parse(headers["cf-aig-metadata"])).toEqual({
      workspaceId: "ws_a",
      surface: "workspace_copilot",
      intent: "workspace_chat",
    });
  });

  /**
   * Regression coverage for the 401 an Authenticated Gateway returns when the
   * app sends no credential at all: the header must be absent (not empty)
   * when unconfigured, so an unauthenticated gateway keeps working with zero
   * setup, and present as a Bearer token the moment one is issued.
   */
  it("omits cf-aig-authorization when no gateway token is configured", () => {
    expect(gatewayHeaders({ intent: "workspace_chat" })["cf-aig-authorization"]).toBeUndefined();
  });

  it("sends cf-aig-authorization as a bearer token when configured", () => {
    process.env.CLOUDFLARE_AI_GATEWAY_TOKEN = "cfut_test_token";
    expect(gatewayHeaders({ intent: "workspace_chat" })["cf-aig-authorization"]).toBe(
      "Bearer cfut_test_token",
    );
  });
});
