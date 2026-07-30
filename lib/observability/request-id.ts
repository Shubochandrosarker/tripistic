/**
 * Correlation-id helpers that are safe on the Edge runtime.
 *
 * Kept in their own module with no Node built-in imports on purpose:
 * `middleware.ts` runs on Edge, where `node:async_hooks` (and therefore
 * `logger.ts`, which the rest of the observability code depends on) is not
 * available. Importing the logger from middleware would break the bundle.
 */

/**
 * Header carrying the correlation id.
 *
 * Set by middleware on every request so an id exists before any handler runs,
 * and echoed on the response so a client or reverse proxy reporting a failure
 * can quote the exact id to search for.
 */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Accepts an externally supplied id only if it is short and boring.
 *
 * The id is echoed back and written into log lines, so an unvalidated value
 * is a log-injection vector: newlines would let a caller forge entries, and
 * unbounded length would let them bloat every line of an incident's logs.
 * Anything failing this gets a freshly generated id instead.
 */
export function sanitizeRequestId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return null;
  return /^[A-Za-z0-9._:-]+$/.test(trimmed) ? trimmed : null;
}
