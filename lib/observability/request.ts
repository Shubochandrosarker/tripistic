import { logger, newRequestId, runWithRequestContext } from "@/lib/observability/logger";
import { REQUEST_ID_HEADER, sanitizeRequestId } from "@/lib/observability/request-id";

// Re-exported so Node-runtime callers have one import site. Middleware must
// import from `request-id` directly — this module reaches the logger, which
// uses `node:async_hooks` and is not available on Edge.
export { REQUEST_ID_HEADER, sanitizeRequestId };

export function resolveRequestId(headers: Headers): string {
  return sanitizeRequestId(headers.get(REQUEST_ID_HEADER)) ?? newRequestId();
}

/**
 * Runs a route handler inside a correlated logging context.
 *
 * Applied to the routes where correlation earns its keep during an incident —
 * the payment and billing webhooks, and the scheduled-job endpoint — rather
 * than blanket-wrapped across all 120 routes, which would be a large diff for
 * routes nobody greps by request id. Adopting it elsewhere is a one-line
 * change per route.
 */
export function withRequestContext<Args extends unknown[]>(
  route: string,
  handler: (request: Request, ...args: Args) => Promise<Response>,
): (request: Request, ...args: Args) => Promise<Response> {
  return async (request: Request, ...args: Args) => {
    const requestId = resolveRequestId(request.headers);
    const startedAt = Date.now();

    return runWithRequestContext({ requestId, route }, async () => {
      try {
        const response = await handler(request, ...args);
        // Echo it, so a failure report can name the id to search for.
        response.headers.set(REQUEST_ID_HEADER, requestId);
        logger.info("http.request", {
          method: request.method,
          status: response.status,
          durationMs: Date.now() - startedAt,
        });
        return response;
      } catch (error) {
        // A handler that throws past its own try/catch would otherwise
        // produce an opaque framework 500 with nothing tying it to the
        // request that caused it.
        logger.error("http.unhandled", { method: request.method, durationMs: Date.now() - startedAt }, error);
        throw error;
      }
    });
  };
}
