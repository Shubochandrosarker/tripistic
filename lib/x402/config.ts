/**
 * x402 configuration and the route price list.
 *
 * x402 is an experimental settlement rail: an HTTP 402 response advertises a
 * price, the caller pays on-chain, and a proof of that payment buys time-boxed
 * access to the route. It exists here for autonomous agents that have a wallet
 * and no way to complete a Stripe checkout.
 *
 * Three rules shape this file, and all three come from the V3 brief.
 *
 * **Off by default.** `X402_ENABLED` is unset in every environment until
 * someone turns it on deliberately. An experimental payment rail that switches
 * itself on because a variable was copied between environments is not
 * experimental, it is live.
 *
 * **Testnet unless someone says otherwise, twice.** A mainnet network name
 * additionally requires `X402_ALLOW_MAINNET=true`. One variable is a typo away
 * from taking real money on untested code; two is a decision.
 *
 * **Nowhere near Stripe.** Nothing in `lib/x402/` touches `Payment`,
 * `Booking`, or any Stripe path. Bookings are the revenue that pays the bills
 * and they stay on the rail that is proven.
 */

export type X402Config = {
  enabled: boolean;
  network: string;
  payTo: string;
  facilitatorUrl: string;
  isMainnet: boolean;
};

/** Networks that move real value. Anything else is treated as a testnet. */
const MAINNET_NETWORKS = new Set(["base", "ethereum", "polygon", "arbitrum", "optimism"]);

function read(key: string): string {
  return (process.env[key] ?? "").trim();
}

export function isMainnetNetwork(network: string): boolean {
  return MAINNET_NETWORKS.has(network.toLowerCase());
}

export function x402Config(): X402Config {
  const network = read("X402_NETWORK") || "base-sepolia";
  return {
    enabled: read("X402_ENABLED") === "true",
    network,
    payTo: read("X402_PAY_TO"),
    facilitatorUrl: read("X402_FACILITATOR_URL"),
    isMainnet: isMainnetNetwork(network),
  };
}

export type X402Readiness =
  | { ready: true; config: X402Config }
  | { ready: false; reason: string; config: X402Config };

/**
 * Whether x402 may serve a request right now.
 *
 * Returns a reason rather than a boolean so the admin screen can say which
 * piece is missing. "Not ready" with no explanation is the kind of status that
 * costs an afternoon.
 */
export function x402Readiness(): X402Readiness {
  const config = x402Config();

  if (!config.enabled) return { ready: false, reason: "X402_ENABLED is not true.", config };
  if (!config.payTo) return { ready: false, reason: "X402_PAY_TO is not set.", config };
  if (!config.facilitatorUrl) {
    return { ready: false, reason: "X402_FACILITATOR_URL is not set.", config };
  }
  if (config.isMainnet && read("X402_ALLOW_MAINNET") !== "true") {
    return {
      ready: false,
      reason: `X402_NETWORK is "${config.network}", a mainnet. Set X402_ALLOW_MAINNET=true to accept real funds.`,
      config,
    };
  }
  return { ready: true, config };
}

/**
 * The protected routes and what they cost.
 *
 * An explicit allow-list, not a prefix match. A prefix would silently start
 * charging for any route added underneath it later, and the first sign of that
 * would be an agent integration breaking with a 402 nobody meant to introduce.
 *
 * Amounts are decimal strings in the facilitator's unit (USDC), kept as strings
 * because binary floats cannot represent them exactly and this value ends up in
 * a signed payment requirement.
 */
export type X402Route = {
  path: string;
  amount: string;
  currency: string;
  description: string;
  /** How long access lasts once paid. */
  ttlSeconds: number;
  /** Calls allowed per grant. */
  maxUses: number;
};

export const X402_ROUTES: readonly X402Route[] = [
  {
    path: "/api/agent/travel-search",
    amount: "0.01",
    currency: "USDC",
    description: "Structured search across publicly listed Tripistic tours.",
    ttlSeconds: 3_600,
    maxUses: 50,
  },
  {
    path: "/api/agent/itinerary",
    amount: "0.05",
    currency: "USDC",
    description: "Generate a day-by-day itinerary grounded in real Tripistic inventory.",
    ttlSeconds: 3_600,
    maxUses: 10,
  },
] as const;

export function findX402Route(pathname: string): X402Route | undefined {
  return X402_ROUTES.find((route) => route.path === pathname);
}
