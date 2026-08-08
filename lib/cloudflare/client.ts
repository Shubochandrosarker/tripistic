import { logger } from "@/lib/observability/logger";

import { cloudflareApiToken, cloudflareConfig } from "@/lib/cloudflare/config";

/**
 * One HTTP client for every Cloudflare REST call Tripistic makes.
 *
 * Before this, the Custom Hostname provider carried its own copy of the
 * envelope handling, error extraction and auth header. Adding Workers for
 * Platforms, Vectorize and R2 would have meant three more copies of the same
 * twenty lines, each free to get the error handling subtly wrong. The
 * envelope is identical across the v4 API, so it is unwrapped once here.
 *
 * Three behaviours are deliberate and worth stating:
 *
 * **Errors carry Cloudflare's own code.** `CloudflareApiError.code` is the
 * numeric code from the response body, not the HTTP status. Callers need it:
 * "custom hostname already exists" (1406) is a conflict the domain service
 * recovers from by adopting the existing record, while a generic 400 is not.
 *
 * **Retries are narrow.** Only 429 and 5xx, only for idempotent methods, with
 * a bounded backoff. Retrying a POST that creates a Worker script would be a
 * way to deploy twice.
 *
 * **The token never reaches a log.** Failures log the method, path and
 * Cloudflare error code. The request headers are never logged, and the token
 * is read at call time rather than held on the instance so it does not appear
 * in a heap dump of a long-lived object.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_TIMEOUT_MS = 15_000;
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE"]);
const MAX_ATTEMPTS = 3;

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
    readonly path: string,
  ) {
    super(message);
    this.name = "CloudflareApiError";
  }
}

/** Raised when a capability is used without its credentials configured. */
export class CloudflareNotConfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not configured for this deployment.`);
    this.name = "CloudflareNotConfiguredError";
  }
}

type CloudflareEnvelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
  result: T;
};

export type CloudflareRequestInit = {
  method?: string;
  /** JSON body. Mutually exclusive with `formData`. */
  body?: unknown;
  /** Multipart body — Workers script uploads need this. */
  formData?: FormData;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Treat these Cloudflare error codes as success and return `null`. */
  tolerateCodes?: number[];
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstErrorCode(payload: CloudflareEnvelope<unknown> | null): number | null {
  const code = payload?.errors?.find((error) => typeof error.code === "number")?.code;
  return typeof code === "number" ? code : null;
}

function errorMessage(payload: CloudflareEnvelope<unknown> | null, fallback: string): string {
  const joined = payload?.errors
    ?.map((error) => error.message)
    .filter(Boolean)
    .join("; ");
  return joined && joined.length > 0 ? joined : fallback;
}

async function requestOnce<T>(
  path: string,
  init: CloudflareRequestInit,
  token: string,
): Promise<{ status: number; payload: CloudflareEnvelope<T> | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    };
    // `fetch` sets the multipart boundary itself; setting Content-Type by hand
    // for FormData produces a body the server cannot parse.
    if (!init.formData) headers["Content-Type"] = "application/json";

    const response = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.formData ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as CloudflareEnvelope<T> | null;
    return { status: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Performs a Cloudflare v4 API call and unwraps the envelope.
 *
 * Returns `null` — rather than throwing — when the response carries one of
 * `tolerateCodes`. That is for the genuinely-fine-to-ignore cases: deleting a
 * custom hostname that is already gone, or a script that was never uploaded.
 * Turning those into exceptions makes every caller write the same try/catch.
 */
export async function cloudflareRequest<T>(
  path: string,
  init: CloudflareRequestInit = {},
): Promise<T | null> {
  const token = cloudflareApiToken();
  if (!token) throw new CloudflareNotConfiguredError("CLOUDFLARE_API_TOKEN");

  const method = (init.method ?? "GET").toUpperCase();
  let lastError: CloudflareApiError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let status: number;
    let payload: CloudflareEnvelope<T> | null;
    try {
      ({ status, payload } = await requestOnce<T>(path, { ...init, method }, token));
    } catch (error) {
      // Network failure or timeout. Same retry policy as a 5xx.
      lastError = new CloudflareApiError(
        error instanceof Error && error.name === "AbortError"
          ? "Cloudflare API request timed out."
          : "Cloudflare API request failed.",
        0,
        null,
        path,
      );
      if (!RETRYABLE_METHODS.has(method) || attempt === MAX_ATTEMPTS) throw lastError;
      await delay(200 * 2 ** (attempt - 1));
      continue;
    }

    if (payload?.success) return payload.result;

    const code = firstErrorCode(payload);
    if (code !== null && init.tolerateCodes?.includes(code)) return null;

    lastError = new CloudflareApiError(
      errorMessage(payload, `Cloudflare API request failed with status ${status}.`),
      status,
      code,
      path,
    );

    const retryable = status === 429 || status >= 500;
    if (!retryable || !RETRYABLE_METHODS.has(method) || attempt === MAX_ATTEMPTS) {
      logger.warn("cloudflare.request_failed", {
        method,
        path,
        status,
        cloudflareCode: code,
        attempt,
      });
      throw lastError;
    }
    await delay(200 * 2 ** (attempt - 1));
  }

  // Unreachable: the loop either returns or throws on its final attempt.
  throw lastError ?? new CloudflareApiError("Cloudflare API request failed.", 0, null, path);
}

export function accountPath(suffix: string): string {
  const { accountId } = cloudflareConfig();
  if (!accountId) throw new CloudflareNotConfiguredError("CLOUDFLARE_ACCOUNT_ID");
  return `/accounts/${accountId}${suffix}`;
}

export function customHostnameZonePath(suffix: string): string {
  const { customHostnameZoneId } = cloudflareConfig();
  if (!customHostnameZoneId) throw new CloudflareNotConfiguredError("CLOUDFLARE_ZONE_ID");
  return `/zones/${customHostnameZoneId}${suffix}`;
}
