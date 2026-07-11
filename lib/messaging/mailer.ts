import nodemailer, { type Transporter } from "nodemailer";

let cachedTransporter: Transporter | null = null;

/**
 * Constructed lazily, on first use inside a service call — never at module
 * load. Matches the identical "optional integration" convention Phase 4
 * established for the Stripe client (`lib/payments/stripe-client.ts`): the
 * app still boots and every non-email route still works with no SMTP
 * configured.
 */
export function getMailer(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error("SMTP_HOST is not configured — email delivery is unavailable until it is set.");
  }
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
  return cachedTransporter;
}

/** `"Business Name" <no-reply@…>` when a display name is available, else the bare address. */
export function getFromAddress(fromName?: string | null): string {
  const address = process.env.EMAIL_FROM || "no-reply@tripistic.app";
  const trimmed = fromName?.trim();
  return trimmed ? `"${trimmed.replace(/"/g, "")}" <${address}>` : address;
}
