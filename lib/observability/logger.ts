import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Structured logging with correlation IDs and PII redaction.
 *
 * Replaces bare `console.error("[api] unhandled error:", error)`. Two things
 * were wrong with that, and they compound:
 *
 *   1. Unstructured lines cannot be queried. "Show me every failed payment
 *      webhook for this workspace in the last hour" is the question an
 *      operator actually asks during an incident, and prose interpolated into
 *      a string cannot answer it.
 *   2. Nothing stopped a guest's email address, a Stripe secret, or a session
 *      token from being written to stdout, where it lands in the container
 *      runtime's log store and every downstream shipper — outliving the
 *      database row it came from, and outside every deletion path the app
 *      offers. Redaction has to happen at the boundary, not by remembering to
 *      leave things out at each call site.
 *
 * Output is one JSON object per line. In development that is still readable
 * enough, and a single format means no environment-specific parsing.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  // Quieter by default in production, verbose in development and tests where
  // someone is actually reading the output.
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Per-request context, propagated without threading a parameter through every
 * function. `AsyncLocalStorage` survives `await` boundaries, so a log line
 * written deep inside a payment service still carries the request id of the
 * webhook that triggered it.
 */
export type RequestContext = {
  requestId: string;
  workspaceId?: string;
  userId?: string;
  route?: string;
};

const store = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return store.run(context, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return store.getStore();
}

/** Adds fields to the active context, if there is one. No-op outside a request. */
export function enrichRequestContext(fields: Partial<Omit<RequestContext, "requestId">>): void {
  const context = store.getStore();
  if (!context) return;
  Object.assign(context, fields);
}

export function newRequestId(): string {
  return randomUUID();
}

/**
 * Keys whose values are replaced wholesale.
 *
 * Matched case-insensitively as substrings, so `stripeSecretKey`,
 * `STRIPE_SECRET_KEY` and `secret` are all caught by one entry. Erring
 * towards over-redaction is deliberate: a redacted field costs one debugging
 * round-trip, a leaked one cannot be un-leaked.
 */
const REDACT_KEYS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "signature",
  "credential",
  "session",
  "ssn",
  "cardnumber",
  "card_number",
  "cvv",
  "iban",
];

/** Keys that hold PII worth keeping *shape* of, but not content. */
const MASK_KEYS = ["email", "phone", "toemail", "guestemail", "contactemail"];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
/** Stripe-style live/test keys and webhook secrets, wherever they appear. */
const SECRET_PATTERN = /\b(sk|rk|whsec|pk)_[A-Za-z0-9_]{8,}/g;
/** Long bearer-ish blobs — JWTs and similar. */
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g;

/**
 * Masks an email as `j***@example.com`.
 *
 * Keeps the domain and first character, which is enough for an operator to
 * confirm "yes, that is the right guest" without the log itself becoming a
 * copy of the customer list.
 */
export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  return `${value[0]}***${value.slice(at)}`;
}

function maskScalar(value: string): string {
  if (value.includes("@")) return maskEmail(value);
  if (value.length <= 4) return "***";
  return `***${value.slice(-2)}`;
}

function scrubString(value: string): string {
  return value
    .replace(SECRET_PATTERN, "[redacted-secret]")
    .replace(JWT_PATTERN, "[redacted-token]")
    .replace(EMAIL_PATTERN, (match) => maskEmail(match));
}

/**
 * Recursively redacts a value for logging.
 *
 * Depth-limited and cycle-safe: a Prisma model or an error with a circular
 * `cause` chain must not be able to hang or blow the stack inside the logger,
 * of all places.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "function") return "[function]";

  if (depth >= 6) return "[truncated]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      // Stacks carry file paths and sometimes interpolated arguments; keep
      // them, but scrubbed like anything else.
      stack: value.stack ? scrubString(value.stack) : undefined,
    };
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => redact(item, depth + 1, seen));
    }

    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (REDACT_KEYS.some((needle) => lower.includes(needle))) {
        out[key] = "[redacted]";
      } else if (MASK_KEYS.some((needle) => lower.includes(needle))) {
        out[key] = typeof raw === "string" ? maskScalar(raw) : redact(raw, depth + 1, seen);
      } else {
        out[key] = redact(raw, depth + 1, seen);
      }
    }
    return out;
  }

  return "[unserializable]";
}

export type LogFields = Record<string, unknown>;

function emit(level: LogLevel, event: string, fields?: LogFields, error?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel()]) return;

  const context = store.getStore();
  const line: Record<string, unknown> = {
    level,
    event,
    time: new Date().toISOString(),
    ...(context?.requestId ? { requestId: context.requestId } : {}),
    ...(context?.workspaceId ? { workspaceId: context.workspaceId } : {}),
    ...(context?.userId ? { userId: context.userId } : {}),
    ...(context?.route ? { route: context.route } : {}),
    ...(fields ? (redact(fields) as LogFields) : {}),
  };
  if (error !== undefined) line.error = redact(error);

  // stdout/stderr split so a container runtime's default stream routing still
  // separates problems from noise.
  const serialized = safeStringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

/**
 * `JSON.stringify` cannot fail here — `redact` already removed cycles and
 * exotic values — but a logger that throws would take down the request it was
 * describing, so the fallback exists regardless.
 */
function safeStringify(line: Record<string, unknown>): string {
  try {
    return JSON.stringify(line);
  } catch {
    return JSON.stringify({ level: line.level, event: line.event, time: line.time, error: "log serialization failed" });
  }
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields, error?: unknown) => emit("warn", event, fields, error),
  error: (event: string, fields?: LogFields, error?: unknown) => emit("error", event, fields, error),
};
