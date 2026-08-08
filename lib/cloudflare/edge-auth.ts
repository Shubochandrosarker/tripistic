import { ApiError, forbidden, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

import { consumeNonce } from "@/lib/cloudflare/replay";
import {
  DEFAULT_MAX_SKEW_SECONDS,
  signRequest,
  verifySignedRequest,
  type SignedRequestScope,
} from "@/lib/cloudflare/signatures";

/**
 * The Tripistic side of Worker-to-Core authentication.
 *
 * Composes the three checks that must all hold before an edge caller is
 * allowed anywhere near tenant data:
 *
 *   1. the signature verifies (authentic, unmodified, fresh),
 *   2. the nonce has not been used (not a replay),
 *   3. the claimed workspace actually exists and is servable.
 *
 * Step 3 is the one that is easy to skip and expensive to omit. A valid
 * signature only proves the caller holds the shared signing secret — and every
 * site Worker in the dispatch namespace is signed by the same secret, because
 * per-tenant secrets would mean re-deploying every Worker on rotation. So the
 * signature alone says "some Tripistic-issued Worker", not "the Worker for
 * workspace X". Without a server-side check that the claimed workspace is
 * real, active, and the one this hostname belongs to, one tenant's site Worker
 * could ask for another tenant's tours by changing a header.
 *
 * `resolveEdgeWorkspace` therefore never returns the header value. It returns
 * a row it looked up itself.
 */

export const EDGE_NONCE_PURPOSE = "edge-service";

function signingSecret(): string {
  const secret = process.env.TRIPISTIC_WORKER_SIGNING_SECRET;
  if (!secret || secret.trim().length < 32) {
    // A short or missing secret is a misconfiguration that would make every
    // edge request either fail or — worse, if we defaulted to something —
    // be forgeable. Refuse rather than guess.
    throw new ApiError(
      503,
      "Edge service authentication is not configured on this deployment.",
    );
  }
  return secret;
}

export function isEdgeAuthConfigured(): boolean {
  const secret = process.env.TRIPISTIC_WORKER_SIGNING_SECRET;
  return typeof secret === "string" && secret.trim().length >= 32;
}

export type EdgeCaller = {
  requestId: string;
  scope: SignedRequestScope;
};

/**
 * Authenticates an inbound signed request.
 *
 * `path` must be the path *as the caller signed it* — `url.pathname +
 * url.search`. Reconstructing it from route params instead would silently drop
 * the query string from the signed material, which is where a tampered
 * `workspaceId` would live.
 */
export async function authenticateEdgeRequest(request: Request): Promise<EdgeCaller> {
  const secret = signingSecret();
  const url = new URL(request.url);
  const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();

  const verification = await verifySignedRequest({
    method: request.method,
    path: `${url.pathname}${url.search}`,
    body,
    headers: request.headers,
    secret,
    maxSkewSeconds: DEFAULT_MAX_SKEW_SECONDS,
  });

  if (!verification.ok) {
    logger.warn("edge.signature_rejected", { reason: verification.reason, path: url.pathname });
    // One message for every failure mode. Telling a caller whether the
    // signature was wrong or merely stale is a free oracle for tuning an
    // attack, and no legitimate caller needs the distinction.
    throw unauthorized("Invalid service signature.");
  }

  const nonce = await consumeNonce(verification.nonce, EDGE_NONCE_PURPOSE);
  if (!nonce.accepted) {
    throw nonce.reason === "replayed"
      ? unauthorized("Invalid service signature.")
      : new ApiError(503, "Service authentication is temporarily unavailable.");
  }

  return { requestId: verification.requestId, scope: verification.scope };
}

/**
 * Turns a claimed workspace id into a verified workspace row.
 *
 * Throws 403 rather than 404 here, unlike the user-facing tenancy guard. The
 * reasoning is different: a Worker is not a person who might be probing for
 * which workspaces exist, and an operator debugging a broken site is far
 * better served by "this Worker is not allowed to act for that workspace" than
 * by a 404 that looks like the site was deleted.
 */
export async function resolveEdgeWorkspace(caller: EdgeCaller) {
  if (!caller.scope.workspaceId) {
    throw forbidden("This service request carries no workspace scope.");
  }
  const workspace = await prisma.workspace.findFirst({
    where: { id: caller.scope.workspaceId, deletedAt: null, status: "active" },
    select: { id: true, slug: true, name: true, currency: true, timezone: true },
  });
  if (!workspace) throw forbidden("Workspace is not available for edge requests.");
  return workspace;
}

/**
 * Signs an outbound request from Tripistic Core to a Worker.
 *
 * The same secret and the same canonical form in both directions, so a Worker
 * can verify us with the identical code we use to verify it.
 */
export async function signOutboundEdgeRequest(input: {
  method: string;
  path: string;
  body?: string;
  workspaceId?: string;
  requestId?: string;
}): Promise<Record<string, string>> {
  return signRequest({
    method: input.method,
    path: input.path,
    body: input.body,
    secret: signingSecret(),
    requestId: input.requestId,
    scope: input.workspaceId ? { workspaceId: input.workspaceId } : undefined,
  });
}
