import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { logger } from "@/lib/observability/logger";

/**
 * Error type thrown by auth/tenancy guards and API handlers.
 * Carries an HTTP status; message must always be safe to show a client.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function unauthorized(message = "Authentication required") {
  return new ApiError(401, message);
}

export function forbidden(message = "You do not have permission to do this") {
  return new ApiError(403, message);
}

/** 404 is used for out-of-tenant lookups so resource existence is not leaked. */
export function notFound(message = "Not found") {
  return new ApiError(404, message);
}

export function badRequest(message = "Invalid request") {
  return new ApiError(400, message);
}

export function conflict(message = "Conflict") {
  return new ApiError(409, message);
}

/**
 * Maps any thrown error to a safe JSON response.
 * Unknown errors are logged server-side and returned as a generic 500.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid input", details: error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  // Structured, and stamped with the request id when the route opted into
  // `withRequestContext` — so a 500 a user reports can be found by id.
  logger.error("api.unhandled_error", undefined, error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export function json<T>(data: T, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

/**
 * Same as `json`, plus `Cache-Control: no-store`. Use for any public
 * endpoint whose data must never be shared across callers or served stale
 * from a cache/CDN — availability counts, booking confirmations.
 */
export function noStoreJson<T>(data: T, init?: number | ResponseInit) {
  const base = typeof init === "number" ? { status: init } : (init ?? {});
  const headers = new Headers(base.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(data, { ...base, headers });
}
