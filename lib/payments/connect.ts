import type { Prisma, User, Workspace, WorkspacePaymentAccount } from "@prisma/client";
import type Stripe from "stripe";
import { conflict } from "@/lib/api";
import { prisma, type Db } from "@/lib/db";
import { fromStripeAmount, getStripeClient, toStripeAmount } from "@/lib/payments/stripe-client";

export type ConnectReturnState = "return" | "refresh";

function appBaseUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function connectReturnUrl(workspaceSlug: string, state: ConnectReturnState) {
  return `${appBaseUrl()}/dashboard/payments?workspace=${encodeURIComponent(workspaceSlug)}&connect=${state}`;
}

export function platformFeeBpsFromEnv(): number {
  const parsed = Number.parseInt(process.env.TRIPISTIC_PLATFORM_FEE_BPS ?? "0", 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 10_000);
}

export function supportedConnectCountriesFromEnv(): readonly string[] {
  const raw = process.env.TRIPISTIC_CONNECT_COUNTRIES ?? "US";
  const countries = raw
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => /^[A-Z]{2}$/.test(entry));
  return countries.length > 0 ? [...new Set(countries)] : ["US"];
}

export function assertWorkspaceCountrySupported(workspace: Pick<Workspace, "country">): string {
  const country = preferredCountry(workspace);
  const supported = supportedConnectCountriesFromEnv();
  if (!supported.includes(country)) {
    throw conflict(
      `Stripe Connect is not enabled for ${country}. Supported launch countries: ${supported.join(", ")}.`,
    );
  }
  return country;
}

export function calculatePlatformFeeAmount(amount: number, platformFeeBps: number): number {
  if (amount <= 0 || platformFeeBps <= 0) return 0;
  return Math.floor((amount * platformFeeBps) / 10_000);
}

function preferredCountry(workspace: Pick<Workspace, "country">): string {
  const country = workspace.country?.trim().toUpperCase();
  return country && /^[A-Z]{2}$/.test(country) ? country : "US";
}

function currencyForStripe(currency: string): string {
  return currency.trim().toLowerCase();
}

function requirementSummary(account: Stripe.Account): Prisma.InputJsonObject {
  return {
    currentlyDue: account.requirements?.currently_due ?? [],
    eventuallyDue: account.requirements?.eventually_due ?? [],
    pastDue: account.requirements?.past_due ?? [],
    pendingVerification: account.requirements?.pending_verification ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

function capabilitySummary(account: Stripe.Account): Prisma.InputJsonObject {
  return {
    cardPayments: account.capabilities?.card_payments ?? null,
    transfers: account.capabilities?.transfers ?? null,
  };
}

export function statusFromStripeAccount(account: Stripe.Account) {
  if (account.charges_enabled && account.payouts_enabled) return "enabled";
  if (account.requirements?.disabled_reason) return "restricted";
  if (account.details_submitted) return "restricted";
  return "onboarding";
}

export async function upsertWorkspacePaymentAccountFromStripe(
  tx: Db,
  workspaceId: string,
  account: Stripe.Account,
): Promise<WorkspacePaymentAccount> {
  return tx.workspacePaymentAccount.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      provider: "stripe",
      providerAccountId: account.id,
      accountType: account.type ?? "express",
      status: statusFromStripeAccount(account),
      country: account.country ?? null,
      defaultCurrency: account.default_currency?.toUpperCase() ?? null,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      platformFeeBps: platformFeeBpsFromEnv(),
      disabledReason: account.requirements?.disabled_reason ?? null,
      requirements: requirementSummary(account),
      capabilities: capabilitySummary(account),
      lastSyncedAt: new Date(),
    },
    update: {
      providerAccountId: account.id,
      accountType: account.type ?? "express",
      status: statusFromStripeAccount(account),
      country: account.country ?? null,
      defaultCurrency: account.default_currency?.toUpperCase() ?? null,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      disabledReason: account.requirements?.disabled_reason ?? null,
      requirements: requirementSummary(account),
      capabilities: capabilitySummary(account),
      lastSyncedAt: new Date(),
    },
  });
}

export async function refreshWorkspacePaymentAccount(workspaceId: string) {
  const existing = await prisma.workspacePaymentAccount.findUnique({ where: { workspaceId } });
  if (!existing) return null;

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(existing.providerAccountId);
  return prisma.$transaction((tx) => upsertWorkspacePaymentAccountFromStripe(tx, workspaceId, account));
}

export async function createConnectOnboardingLink({
  workspace,
  user,
}: {
  workspace: Pick<Workspace, "id" | "slug" | "name" | "country" | "currency">;
  user: Pick<User, "email">;
}) {
  const stripe = getStripeClient();
  let paymentAccount = await prisma.workspacePaymentAccount.findUnique({ where: { workspaceId: workspace.id } });
  const country = assertWorkspaceCountrySupported(workspace);

  if (!paymentAccount) {
    const account = await stripe.accounts.create({
      type: "express",
      country,
      default_currency: currencyForStripe(workspace.currency),
      email: user.email,
      business_profile: {
        name: workspace.name,
        product_description: "Tours, activities, and travel experiences sold through Tripistic direct booking.",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
      },
    });
    paymentAccount = await prisma.$transaction((tx) =>
      upsertWorkspacePaymentAccountFromStripe(tx, workspace.id, account),
    );
  }

  const accountLink = await stripe.accountLinks.create({
    account: paymentAccount.providerAccountId,
    type: "account_onboarding",
    refresh_url: connectReturnUrl(workspace.slug, "refresh"),
    return_url: connectReturnUrl(workspace.slug, "return"),
    collection_options: {
      fields: "eventually_due",
      future_requirements: "include",
    },
  });

  return { url: accountLink.url, paymentAccount };
}

export async function createConnectLoginLink(workspaceId: string) {
  const paymentAccount = await prisma.workspacePaymentAccount.findUnique({ where: { workspaceId } });
  if (!paymentAccount) {
    throw conflict("Connect Stripe first before opening the Stripe dashboard.");
  }

  const stripe = getStripeClient();
  const link = await stripe.accounts.createLoginLink(paymentAccount.providerAccountId);
  return { url: link.url };
}

export type ConnectedAccountBalance = {
  available: Array<{ amount: number; currency: string }>;
  pending: Array<{ amount: number; currency: string }>;
  instantAvailable: Array<{ amount: number; currency: string }>;
};

function mapBalanceAmounts(amounts: Stripe.Balance.Available[]): Array<{ amount: number; currency: string }> {
  return amounts.map((entry) => ({
    amount: fromStripeAmount(entry.amount, entry.currency),
    currency: entry.currency.toUpperCase(),
  }));
}

export async function getConnectedAccountBalance(workspaceId: string): Promise<ConnectedAccountBalance> {
  const paymentAccount = await prisma.workspacePaymentAccount.findUnique({ where: { workspaceId } });
  if (!paymentAccount) {
    throw conflict("Connect Stripe before viewing payout balances.");
  }

  const stripe = getStripeClient();
  const balance = await stripe.balance.retrieve({}, { stripeAccount: paymentAccount.providerAccountId });
  return {
    available: mapBalanceAmounts(balance.available),
    pending: mapBalanceAmounts(balance.pending),
    instantAvailable: mapBalanceAmounts(balance.instant_available ?? []),
  };
}

export async function getChargeReadyPaymentAccount(workspaceId: string) {
  const account = await prisma.workspacePaymentAccount.findUnique({ where: { workspaceId } });
  if (!account || !account.chargesEnabled || !account.payoutsEnabled || account.status !== "enabled") {
    throw conflict("This workspace must finish Stripe Connect onboarding before accepting paid bookings.");
  }
  return account;
}

export function connectedPaymentIntentData({
  booking,
  paymentAccount,
}: {
  booking: { totalAmount: number; currency: string; id: string; workspaceId: string; reference: string };
  paymentAccount: Pick<WorkspacePaymentAccount, "providerAccountId" | "platformFeeBps">;
}): Stripe.Checkout.SessionCreateParams.PaymentIntentData {
  const stripeAmount = toStripeAmount(booking.totalAmount, booking.currency);
  const platformFeeAmount = calculatePlatformFeeAmount(stripeAmount, paymentAccount.platformFeeBps);

  return {
    ...(platformFeeAmount > 0 ? { application_fee_amount: platformFeeAmount } : {}),
    transfer_data: { destination: paymentAccount.providerAccountId },
    metadata: {
      bookingId: booking.id,
      workspaceId: booking.workspaceId,
      bookingReference: booking.reference,
      connectedAccountId: paymentAccount.providerAccountId,
      platformFeeAmount: String(platformFeeAmount),
    },
  };
}
