import { badRequest, handleApiError, json } from "@/lib/api";
import { sendPasswordResetLink } from "@/lib/auth/account";
import { RATE_LIMITS, callerIp, consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { passwordResetRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Starts a password reset.
 *
 * Always answers the same way. Whether the address has an account, is
 * suspended, is SSO-only, or was rate limited into doing nothing, the caller
 * gets one identical 202 — otherwise this endpoint is a free account-existence
 * oracle, which is the raw material for credential stuffing and for phishing
 * that names a real service the target actually uses.
 *
 * Rate limited on both the caller and the target address: the IP budget stops
 * one host enumerating many addresses, and the address budget stops a rotating
 * botnet from mailbombing one person.
 */
const ACCEPTED = {
  ok: true,
  message: "If an account exists for that address, a reset link is on its way.",
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = passwordResetRequestSchema.safeParse(body);
    if (!parsed.success) {
      // A malformed body is the one case that can be reported honestly: it
      // says nothing about any account.
      throw badRequest("Enter a valid email address.");
    }

    const ipBudget = await consumeRateLimit(RATE_LIMITS.passwordResetRequest, callerIp(request));
    const addressBudget = await consumeRateLimit(
      RATE_LIMITS.passwordResetRequest,
      `email:${parsed.data.email}`,
    );

    if (!ipBudget.allowed || !addressBudget.allowed) {
      // Silently accepted rather than 429'd. A 429 here would leak that this
      // address is being targeted, and the honest 202 costs the attacker
      // nothing they did not already know.
      return json(ACCEPTED, { status: 202, headers: rateLimitHeaders(ipBudget) });
    }

    await sendPasswordResetLink(parsed.data.email, { requestIp: callerIp(request) });
    return json(ACCEPTED, 202);
  } catch (error) {
    return handleApiError(error);
  }
}
