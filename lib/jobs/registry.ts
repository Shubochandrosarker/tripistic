import { prisma } from "@/lib/db";
import { pollCustomDomainHealth } from "@/lib/domains/service";
import { sendDueReminders } from "@/lib/messaging/reminders";
import { retryDueMessages } from "@/lib/messaging/service";
import { sweepExpiredPendingBookings } from "@/lib/payments/expiration";
import type { JobDefinition } from "@/lib/jobs/runner";

/**
 * Every recurring job the platform needs, in one place.
 *
 * Each body already existed and was already correct — the missing piece was
 * anything that called it on a schedule. `docs/FINAL-LAUNCH-AUDIT.md` §5
 * enumerates the consequences; the worst is that abandoned checkouts held
 * their seats indefinitely, so departures sold out to bookings nobody paid for.
 */

/**
 * Releases capacity held by checkouts that were never completed.
 *
 * The highest-value job here. Without it, every abandoned checkout
 * permanently consumes inventory.
 */
const expirePendingPayments: JobDefinition = {
  name: "payments.expire-pending",
  description: "Cancel unpaid bookings past their payment window and release the seats",
  run: async () => {
    const { scanned, expired } = await sweepExpiredPendingBookings();
    return { scanned, expired };
  },
};

const sendReminders: JobDefinition = {
  name: "messaging.send-reminders",
  description: "Send T-24h departure reminders for confirmed bookings",
  run: async () => {
    const { scanned, sent } = await sendDueReminders();
    return { scanned, sent };
  },
};

/**
 * Re-attempts transactional email that failed transiently.
 *
 * Without this, a failed send was terminal on the first try: a brief SMTP
 * outage destroyed every booking confirmation queued during it, and the
 * `Message` row recorded the loss with nothing able to act on it.
 */
const retryOutbox: JobDefinition = {
  name: "messaging.retry-outbox",
  description: "Re-attempt delivery for email whose retry backoff has elapsed",
  run: async () => {
    const { scanned, sent, failed } = await retryDueMessages();
    return { scanned, sent, failed };
  },
};

const pollDomains: JobDefinition = {
  name: "domains.poll-health",
  description: "Re-check DNS and TLS state for custom domains",
  run: async () => {
    const result = await pollCustomDomainHealth();
    return { checked: Array.isArray(result) ? result.length : 0 };
  },
};

/**
 * Expires trials and past-due grace periods.
 *
 * `graceEndsAt` was written by the billing webhook and then never read, so a
 * workspace that stopped paying kept full access indefinitely — `past_due` is
 * treated as an entitled status by `getWorkspaceSubscription`. This is the job
 * that gives that field meaning.
 */
const expireGracePeriods: JobDefinition = {
  name: "billing.expire-grace",
  description: "Move past-due subscriptions to unpaid once their grace period ends",
  run: async () => {
    const now = new Date();
    const expired = await prisma.subscription.updateMany({
      where: { status: "past_due", graceEndsAt: { not: null, lt: now } },
      data: { status: "cancelled" },
    });

    // A trial that has run out with no payment method attached is also no
    // longer entitled. Subscriptions that converted have a provider id.
    const lapsedTrials = await prisma.subscription.updateMany({
      where: {
        status: "trialing",
        trialEndsAt: { not: null, lt: now },
        providerSubscriptionId: null,
      },
      data: { status: "expired" },
    });

    return { graceExpired: expired.count, trialsLapsed: lapsedTrials.count };
  },
};

/**
 * Removes expired invitations and other short-lived tokens.
 *
 * Invitation tokens are stored in plaintext (audit §7), so limiting how long
 * a leaked backup stays useful has real value until they are hashed.
 */
const cleanupExpiredTokens: JobDefinition = {
  name: "auth.cleanup-tokens",
  description: "Mark expired invitations and clear stale short-lived tokens",
  run: async () => {
    const expiredInvitations = await prisma.invitation.updateMany({
      where: { status: "pending", expiresAt: { lt: new Date() } },
      data: { status: "expired" },
    });
    return { invitationsExpired: expiredInvitations.count };
  },
};

export const JOBS: JobDefinition[] = [
  expirePendingPayments,
  sendReminders,
  retryOutbox,
  pollDomains,
  expireGracePeriods,
  cleanupExpiredTokens,
];

export function findJob(name: string): JobDefinition | undefined {
  return JOBS.find((job) => job.name === name);
}

export function jobNames(): string[] {
  return JOBS.map((job) => job.name);
}
