import {
  CloudflareNotConfiguredError,
  accountPath,
  cloudflareRequest,
} from "@/lib/cloudflare/client";
import { cloudflareConfig } from "@/lib/cloudflare/config";

/**
 * Workers for Platforms — dispatch namespace operations.
 *
 * Each published tenant website is one user Worker inside a dispatch
 * namespace. A single dispatch Worker owns the public hostnames, looks up
 * which user Worker a hostname maps to, and forwards the request. That gives
 * per-tenant isolation (a tenant's script cannot see another's memory,
 * bindings or secrets) without one Cloudflare route per customer.
 *
 * **Tenants do not author the script.** Tripistic generates it from an
 * approved template and uploads it; the tenant only supplies structured page
 * content, validated by Zod, that the template renders. The V3 brief requires
 * this and it is the single largest risk reduction available here — arbitrary
 * tenant-authored Worker code would be remote code execution inside our
 * account, one review mistake away from reading every binding we ever attach.
 *
 * Script names are derived, never client-supplied: see `siteScriptName`.
 */

export type WorkerScriptUpload = {
  /** The Worker's entry module source. ES module syntax, `export default`. */
  moduleSource: string;
  /**
   * Plain-text bindings baked into the script. Site content and public
   * configuration only.
   *
   * Nothing secret may go here. A tenant Worker is the least trusted thing in
   * the architecture; it gets the data it needs to render and a signed,
   * narrowly scoped way to ask for the rest.
   */
  vars?: Record<string, string>;
  /** Tags Cloudflare stores alongside the script, for later reconciliation. */
  tags?: string[];
};

export type DispatchScript = {
  name: string;
  createdOn: string | null;
  modifiedOn: string | null;
};

function namespace(): string {
  const { dispatchNamespace } = cloudflareConfig();
  if (!dispatchNamespace) throw new CloudflareNotConfiguredError("CLOUDFLARE_DISPATCH_NAMESPACE");
  return dispatchNamespace;
}

/**
 * The Worker script name for a site.
 *
 * Derived from ids the server owns, never from a tenant-supplied slug or
 * hostname. A tenant who could influence this string could collide with
 * another tenant's script name and overwrite their website.
 *
 * Cloudflare script names allow lowercase alphanumerics and hyphens, so the
 * ids are normalised rather than trusted to already be safe.
 */
export function siteScriptName(workspaceId: string, siteId: string): string {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  return `site-${clean(workspaceId)}-${clean(siteId)}`;
}

function scriptPath(scriptName: string): string {
  return accountPath(
    `/workers/dispatch/namespaces/${encodeURIComponent(namespace())}/scripts/${encodeURIComponent(scriptName)}`,
  );
}

/**
 * Uploads (or replaces) a user Worker in the dispatch namespace.
 *
 * Multipart, because that is the only shape the Workers upload API accepts for
 * a module Worker: a `metadata` JSON part naming the main module, plus the
 * module itself as a file part.
 */
export async function uploadSiteWorker(
  scriptName: string,
  upload: WorkerScriptUpload,
): Promise<void> {
  const mainModule = "index.js";
  const metadata = {
    main_module: mainModule,
    compatibility_date: "2026-01-01",
    bindings: Object.entries(upload.vars ?? {}).map(([name, text]) => ({
      type: "plain_text",
      name,
      text,
    })),
    tags: upload.tags ?? [],
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append(
    mainModule,
    new Blob([upload.moduleSource], { type: "application/javascript+module" }),
    mainModule,
  );

  await cloudflareRequest(scriptPath(scriptName), { method: "PUT", formData: form });
}

export async function getSiteWorker(scriptName: string): Promise<DispatchScript | null> {
  const result = await cloudflareRequest<{
    id?: string;
    created_on?: string;
    modified_on?: string;
  }>(scriptPath(scriptName), {
    // 10007 is Cloudflare's "script not found". A missing script is a normal
    // answer to "is this deployed?", not an error.
    tolerateCodes: [10007],
  });
  if (!result) return null;
  return {
    name: result.id ?? scriptName,
    createdOn: result.created_on ?? null,
    modifiedOn: result.modified_on ?? null,
  };
}

export async function deleteSiteWorker(scriptName: string): Promise<void> {
  await cloudflareRequest(scriptPath(scriptName), {
    method: "DELETE",
    tolerateCodes: [10007],
  });
}

/**
 * Confirms the dispatch namespace exists and is reachable.
 *
 * Used by the admin System Health page. Returns `null` when Workers for
 * Platforms is not configured, which the health view renders as
 * "Not Configured" rather than as a failure.
 */
export async function describeDispatchNamespace(): Promise<{ name: string } | null> {
  const { accountId, dispatchNamespace } = cloudflareConfig();
  if (!accountId || !dispatchNamespace) return null;
  const result = await cloudflareRequest<{ namespace_name?: string }>(
    accountPath(`/workers/dispatch/namespaces/${encodeURIComponent(dispatchNamespace)}`),
  );
  return { name: result?.namespace_name ?? dispatchNamespace };
}
