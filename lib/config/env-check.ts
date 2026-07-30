/**
 * Startup configuration validation.
 *
 * The failure this prevents: the application boots happily with a missing or
 * placeholder `AUTH_SECRET`, an unset `DATABASE_URL`, or Stripe half-wired,
 * and the problem surfaces later as an unexplained 500 in front of a paying
 * customer. Configuration errors should be loud, immediate, and describe what
 * to fix.
 *
 * Two severities, because they are genuinely different:
 *
 *   - **error** — the app cannot serve correctly. Boot fails.
 *   - **warning** — a capability is unavailable but the rest works. Booking
 *     without Stripe configured, for instance, is a legitimate state for an
 *     operator still setting up, and refusing to start would be wrong.
 *
 * Values are never echoed. A validator that prints the secret it rejected has
 * moved the secret into the log store, which is the problem it was meant to
 * avoid.
 */

export type CheckSeverity = "error" | "warning";

export type ConfigIssue = {
  severity: CheckSeverity;
  key: string;
  message: string;
};

export type EnvSource = Record<string, string | undefined>;

/** Placeholders shipped in `.env.docker.example` that must never reach production. */
const PLACEHOLDER_PATTERN = /^(CHANGE_ME|changeme|your[-_]|xxx+|placeholder|todo)/i;

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim());
}

/**
 * Minimum entropy for a signing secret, in characters.
 *
 * 32 is the length of `openssl rand -base64 32` output truncated, and the
 * value the docs already tell operators to generate. Shorter secrets are
 * treated as an error rather than a warning: a forgeable session cookie is
 * not a degraded feature, it is an authentication bypass.
 */
const MIN_SECRET_LENGTH = 24;

export function checkEnvironment(env: EnvSource): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const isProduction = env.NODE_ENV === "production";

  const error = (key: string, message: string) => issues.push({ severity: "error", key, message });
  const warn = (key: string, message: string) => issues.push({ severity: "warning", key, message });

  // --- Database -----------------------------------------------------------
  if (!present(env.DATABASE_URL)) {
    error("DATABASE_URL", "is required — the application cannot start without a database.");
  } else if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
    error("DATABASE_URL", "must be a postgresql:// connection string.");
  }

  // --- Authentication -----------------------------------------------------
  const authSecret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;
  if (!present(authSecret)) {
    error("AUTH_SECRET", "is required — sessions cannot be signed without it.");
  } else if (isPlaceholder(authSecret)) {
    error("AUTH_SECRET", "still holds the example placeholder. Generate one with `openssl rand -base64 32`.");
  } else if (authSecret.length < MIN_SECRET_LENGTH) {
    error(
      "AUTH_SECRET",
      `is shorter than ${MIN_SECRET_LENGTH} characters. A guessable signing secret is an authentication bypass, not a weak setting.`,
    );
  }

  // --- Public URL ---------------------------------------------------------
  const appUrl = env.APP_URL ?? env.NEXT_PUBLIC_APP_URL;
  if (!present(appUrl)) {
    warn("APP_URL", "is unset — confirmation links in email will point at localhost.");
  } else if (isProduction && appUrl.startsWith("http://")) {
    warn("APP_URL", "is http:// in production. Payment and session cookies expect https.");
  }

  // --- Payments -----------------------------------------------------------
  // Warnings, not errors: an operator who has not connected Stripe yet still
  // has a working product for free/unpaid bookings.
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (!present(stripeKey)) {
    warn("STRIPE_SECRET_KEY", "is unset — paid bookings and subscription billing are unavailable.");
  } else {
    if (isProduction && stripeKey.startsWith("sk_test_")) {
      error("STRIPE_SECRET_KEY", "is a test key but NODE_ENV is production. Real customers would not be charged.");
    }
    if (!present(env.STRIPE_WEBHOOK_SECRET)) {
      // With a key but no webhook secret, checkout starts and payment is taken
      // but nothing ever confirms the booking. Worse than not configuring
      // Stripe at all, hence an error rather than a warning.
      error(
        "STRIPE_WEBHOOK_SECRET",
        "is required when STRIPE_SECRET_KEY is set — without it payments are taken but bookings are never confirmed.",
      );
    }
  }

  // --- Email --------------------------------------------------------------
  if (!present(env.SMTP_HOST)) {
    warn("SMTP_HOST", "is unset — transactional email is queued and retried, but never delivered.");
  } else if (!present(env.EMAIL_FROM)) {
    warn("EMAIL_FROM", "is unset — email will be sent from the default no-reply address.");
  }

  // --- Scheduler ----------------------------------------------------------
  if (present(env.CRON_SECRET)) {
    if (isPlaceholder(env.CRON_SECRET)) {
      error("CRON_SECRET", "still holds the example placeholder. Generate one or leave it unset.");
    } else if (env.CRON_SECRET.length < MIN_SECRET_LENGTH) {
      error("CRON_SECRET", `is shorter than ${MIN_SECRET_LENGTH} characters and gates job execution over HTTP.`);
    }
  }
  // Deliberately no warning when CRON_SECRET is absent: the worker container
  // is the recommended way to run jobs and needs no secret, so an empty value
  // is a valid, secure choice rather than an oversight.

  return issues;
}

export function formatIssues(issues: ConfigIssue[]): string {
  return issues
    .map((issue) => `  [${issue.severity === "error" ? "ERROR" : "warn "}] ${issue.key} ${issue.message}`)
    .join("\n");
}

export function hasBlockingIssue(issues: ConfigIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/**
 * Validates and reports, throwing on anything blocking.
 *
 * Called from the release step rather than from module load: a check that
 * runs at import time fires during `next build` too, where production
 * secrets are legitimately absent, and would break the build for no reason.
 */
export function assertEnvironment(env: EnvSource = process.env): ConfigIssue[] {
  const issues = checkEnvironment(env);
  if (issues.length > 0) {
    console.log(`[config] ${issues.length} configuration issue(s):\n${formatIssues(issues)}`);
  }
  if (hasBlockingIssue(issues)) {
    throw new Error(
      "Configuration is invalid — refusing to start. Fix the ERROR entries above and redeploy.",
    );
  }
  return issues;
}
