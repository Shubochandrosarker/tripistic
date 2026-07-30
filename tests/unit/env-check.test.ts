import { describe, expect, it } from "vitest";

import { checkEnvironment, hasBlockingIssue, type EnvSource } from "@/lib/config/env-check";

/**
 * Phase 6 — startup configuration validation.
 *
 * This gates deployments: an ERROR here means Compose never starts the app,
 * because the release job exits non-zero. That makes both directions
 * expensive — a false error blocks a legitimate deploy, a missed one puts a
 * broken release in front of customers — so the severity of each case is
 * pinned down here rather than left to judgement at the call site.
 */

const VALID: EnvSource = {
  DATABASE_URL: "postgresql://user:pass@db:5432/tripistic?schema=public",
  AUTH_SECRET: "N0tAPlaceholder-ThisIsLongEnough-abc123",
  APP_URL: "https://tripistic.com",
  SMTP_HOST: "smtp.example.com",
  EMAIL_FROM: "no-reply@tripistic.com",
  STRIPE_SECRET_KEY: "sk_live_realkeyvalue",
  STRIPE_WEBHOOK_SECRET: "whsec_realsecretvalue",
  NODE_ENV: "production",
};

const errors = (env: EnvSource) => checkEnvironment(env).filter((i) => i.severity === "error");
const warnings = (env: EnvSource) => checkEnvironment(env).filter((i) => i.severity === "warning");
const keys = (env: EnvSource) => checkEnvironment(env).map((i) => i.key);

describe("a fully configured production environment", () => {
  it("raises nothing at all", () => {
    expect(checkEnvironment(VALID)).toEqual([]);
    expect(hasBlockingIssue(checkEnvironment(VALID))).toBe(false);
  });
});

describe("blocking failures", () => {
  it("requires a database", () => {
    expect(errors({ ...VALID, DATABASE_URL: undefined })).toHaveLength(1);
    expect(keys({ ...VALID, DATABASE_URL: undefined })).toContain("DATABASE_URL");
  });

  it("rejects a database URL that is not Postgres", () => {
    expect(errors({ ...VALID, DATABASE_URL: "mysql://user@host/db" })).toHaveLength(1);
  });

  it("requires a signing secret", () => {
    expect(errors({ ...VALID, AUTH_SECRET: undefined, NEXTAUTH_SECRET: undefined })).toHaveLength(1);
  });

  it("accepts NEXTAUTH_SECRET as the legacy name", () => {
    const env = { ...VALID, AUTH_SECRET: undefined, NEXTAUTH_SECRET: VALID.AUTH_SECRET };
    expect(errors(env)).toEqual([]);
  });

  it("rejects the shipped placeholder secret", () => {
    // .env.docker.example ships CHANGE_ME_… — reaching production with it
    // means every session cookie is signed with a public value.
    const env = { ...VALID, AUTH_SECRET: "CHANGE_ME_RUN_OPENSSL_RAND_BASE64_32" };
    expect(errors(env)).toHaveLength(1);
    expect(hasBlockingIssue(checkEnvironment(env))).toBe(true);
  });

  it("rejects a short signing secret", () => {
    // A guessable signing secret is an authentication bypass, not a weak
    // setting — so it blocks rather than warns.
    expect(errors({ ...VALID, AUTH_SECRET: "short" })).toHaveLength(1);
  });

  it("rejects a test Stripe key in production", () => {
    const env = { ...VALID, STRIPE_SECRET_KEY: "sk_test_abc123" };
    expect(errors(env).map((i) => i.key)).toContain("STRIPE_SECRET_KEY");
  });

  it("allows a test Stripe key outside production", () => {
    const env = { ...VALID, NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_test_abc123" };
    expect(errors(env)).toEqual([]);
  });

  it("requires a webhook secret whenever Stripe is configured", () => {
    // Key without webhook secret is worse than no Stripe at all: checkout
    // starts, money is taken, and nothing ever confirms the booking.
    const env = { ...VALID, STRIPE_WEBHOOK_SECRET: undefined };
    expect(errors(env).map((i) => i.key)).toContain("STRIPE_WEBHOOK_SECRET");
  });

  it("rejects a placeholder or short CRON_SECRET, which gates job execution over HTTP", () => {
    expect(errors({ ...VALID, CRON_SECRET: "CHANGE_ME_LONG_RANDOM_SECRET" })).toHaveLength(1);
    expect(errors({ ...VALID, CRON_SECRET: "abc" })).toHaveLength(1);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    // An operator fixing a broken deploy should get the whole list in one
    // pass, not discover them one redeploy at a time.
    const env: EnvSource = { NODE_ENV: "production" };
    const found = errors(env).map((i) => i.key);
    expect(found).toContain("DATABASE_URL");
    expect(found).toContain("AUTH_SECRET");
    expect(found.length).toBeGreaterThanOrEqual(2);
  });
});

describe("non-blocking warnings", () => {
  it("does not block a deployment that has not connected Stripe yet", () => {
    const env = { ...VALID, STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined };
    expect(errors(env)).toEqual([]);
    expect(warnings(env).map((i) => i.key)).toContain("STRIPE_SECRET_KEY");
  });

  it("does not block a deployment with no email configured", () => {
    // Messages queue and retry; they simply do not deliver until SMTP lands.
    const env = { ...VALID, SMTP_HOST: undefined };
    expect(errors(env)).toEqual([]);
    expect(warnings(env).map((i) => i.key)).toContain("SMTP_HOST");
  });

  it("warns about an http APP_URL in production without blocking", () => {
    const env = { ...VALID, APP_URL: "http://tripistic.com" };
    expect(errors(env)).toEqual([]);
    expect(warnings(env).map((i) => i.key)).toContain("APP_URL");
  });

  it("accepts http outside production", () => {
    expect(checkEnvironment({ ...VALID, NODE_ENV: "development", APP_URL: "http://localhost:3000" })).toEqual([]);
  });

  it("says nothing when CRON_SECRET is absent", () => {
    // The worker container needs no secret, so unset is a valid and secure
    // choice — nagging about it would train operators to ignore the output.
    const env = { ...VALID, CRON_SECRET: undefined };
    expect(checkEnvironment(env)).toEqual([]);
  });
});

describe("no secret is ever echoed", () => {
  it("keeps rejected values out of the messages", () => {
    const secret = "CHANGE_ME_RUN_OPENSSL_RAND_BASE64_32";
    const stripe = "sk_test_supersecretvalue";
    const serialized = JSON.stringify(
      checkEnvironment({ ...VALID, AUTH_SECRET: secret, STRIPE_SECRET_KEY: stripe }),
    );
    // A validator that prints the secret it rejected has moved that secret
    // into the deploy log, which is the problem it exists to prevent.
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(stripe);
    expect(serialized).not.toContain(VALID.DATABASE_URL as string);
  });
});
