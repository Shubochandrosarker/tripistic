import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { consumeNonce, purgeExpiredNonces } from "@/lib/cloudflare/replay";
import { authenticateEdgeRequest, resolveEdgeWorkspace } from "@/lib/cloudflare/edge-auth";
import { signRequest } from "@/lib/cloudflare/signatures";

import { createTestUser, createTestWorkspace, uniqueSuffix } from "./helpers";

const SECRET = "integration-worker-signing-secret-value-32";

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env.TRIPISTIC_WORKER_SIGNING_SECRET;
  process.env.TRIPISTIC_WORKER_SIGNING_SECRET = SECRET;
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.TRIPISTIC_WORKER_SIGNING_SECRET;
  else process.env.TRIPISTIC_WORKER_SIGNING_SECRET = savedSecret;
});

async function signedRequest(options: {
  url: string;
  method?: string;
  body?: string;
  workspaceId?: string;
  nonce?: string;
  timestampSeconds?: number;
}) {
  const url = new URL(options.url);
  const headers = await signRequest({
    method: options.method ?? "GET",
    path: `${url.pathname}${url.search}`,
    body: options.body,
    secret: SECRET,
    nonce: options.nonce,
    timestampSeconds: options.timestampSeconds,
    scope: options.workspaceId ? { workspaceId: options.workspaceId } : undefined,
  });
  return new Request(options.url, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
}

describe("edge nonce store", () => {
  it("accepts a nonce once and rejects the same nonce afterwards", async () => {
    const nonce = `nonce-${uniqueSuffix()}`;
    expect(await consumeNonce(nonce, "test")).toEqual({ accepted: true });
    expect(await consumeNonce(nonce, "test")).toEqual({ accepted: false, reason: "replayed" });
  });

  /**
   * The insert is the check, so two concurrent copies of the same replayed
   * request cannot both win — a read-then-write would let them.
   */
  it("admits exactly one winner under concurrency", async () => {
    const nonce = `nonce-${uniqueSuffix()}`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => consumeNonce(nonce, "test")),
    );
    expect(results.filter((result) => result.accepted)).toHaveLength(1);
  });

  it("purges only nonces past their expiry", async () => {
    const stale = `nonce-stale-${uniqueSuffix()}`;
    const fresh = `nonce-fresh-${uniqueSuffix()}`;
    await prisma.serviceRequestNonce.create({
      data: { nonce: stale, purpose: "test", expiresAt: new Date(Date.now() - 60_000) },
    });
    await prisma.serviceRequestNonce.create({
      data: { nonce: fresh, purpose: "test", expiresAt: new Date(Date.now() + 60_000) },
    });

    await purgeExpiredNonces();

    expect(await prisma.serviceRequestNonce.findUnique({ where: { nonce: stale } })).toBeNull();
    expect(await prisma.serviceRequestNonce.findUnique({ where: { nonce: fresh } })).not.toBeNull();
  });
});

describe("authenticateEdgeRequest", () => {
  it("accepts a correctly signed request", async () => {
    const request = await signedRequest({
      url: "https://app.tripistic.com/api/edge/tours?limit=5",
      workspaceId: "ws_test",
    });
    const caller = await authenticateEdgeRequest(request);
    expect(caller.scope.workspaceId).toBe("ws_test");
  });

  /**
   * The property the whole scheme exists for: a captured request cannot be
   * sent twice, even inside the freshness window.
   */
  it("rejects a replayed request", async () => {
    const nonce = `replay-${uniqueSuffix()}`;
    const build = () =>
      signedRequest({
        url: "https://app.tripistic.com/api/edge/tours",
        workspaceId: "ws_test",
        nonce,
      });

    await expect(authenticateEdgeRequest(await build())).resolves.toBeTruthy();
    await expect(authenticateEdgeRequest(await build())).rejects.toThrow(
      /Invalid service signature/,
    );
  });

  it("rejects a request whose body was changed after signing", async () => {
    const url = "https://app.tripistic.com/api/edge/tours";
    const headers = await signRequest({
      method: "POST",
      path: "/api/edge/tours",
      body: JSON.stringify({ limit: 5 }),
      secret: SECRET,
      scope: { workspaceId: "ws_test" },
    });
    const tampered = new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ limit: 5000 }),
    });
    await expect(authenticateEdgeRequest(tampered)).rejects.toThrow(/Invalid service signature/);
  });

  it("refuses to run without a signing secret configured", async () => {
    const request = await signedRequest({
      url: "https://app.tripistic.com/api/edge/tours",
      workspaceId: "ws_test",
    });
    delete process.env.TRIPISTIC_WORKER_SIGNING_SECRET;
    await expect(authenticateEdgeRequest(request)).rejects.toThrow(/not configured/);
  });
});

describe("resolveEdgeWorkspace", () => {
  it("resolves an active workspace from the signed scope", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const resolved = await resolveEdgeWorkspace({
      requestId: "req_1",
      scope: { workspaceId: workspace.id },
    });
    expect(resolved.id).toBe(workspace.id);
  });

  /**
   * Every site Worker is signed with the same secret, so a valid signature
   * proves "a Tripistic Worker" and not "this tenant's Worker". The workspace
   * must be resolved server-side, and a claim for a workspace that is not
   * servable must be refused rather than trusted.
   */
  it("refuses a scope naming a workspace that does not exist", async () => {
    await expect(
      resolveEdgeWorkspace({ requestId: "req_1", scope: { workspaceId: "ws_does_not_exist" } }),
    ).rejects.toThrow(/not available for edge requests/);
  });

  it("refuses a scope naming a suspended workspace", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id, { status: "suspended" });
    await expect(
      resolveEdgeWorkspace({ requestId: "req_1", scope: { workspaceId: workspace.id } }),
    ).rejects.toThrow(/not available for edge requests/);
  });

  it("refuses a request that carries no workspace scope", async () => {
    await expect(resolveEdgeWorkspace({ requestId: "req_1", scope: {} })).rejects.toThrow(
      /no workspace scope/,
    );
  });
});
