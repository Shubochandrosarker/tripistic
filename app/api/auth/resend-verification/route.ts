import { badRequest, handleApiError, json } from "@/lib/api";
import { sendVerificationLink } from "@/lib/auth/account";
import { RATE_LIMITS, callerIp, consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { passwordResetRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Re-sends a verification link.
 *
 * Same constant-response rule as password reset: this must not reveal whether
 * an address has an account, nor whether it is already verified.
 */
const ACCEPTED = {
  ok: true,
  message: "If that address needs verifying, a new link is on its way.",
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = passwordResetRequestSchema.safeParse(body);
    if (!parsed.success) throw badRequest("Enter a valid email address.");

    const ipBudget = await consumeRateLimit(RATE_LIMITS.verificationResend, callerIp(request));
    const addressBudget = await consumeRateLimit(
      RATE_LIMITS.verificationResend,
      `email:${parsed.data.email}`,
    );
    if (!ipBudget.allowed || !addressBudget.allowed) {
      return json(ACCEPTED, { status: 202, headers: rateLimitHeaders(ipBudget) });
    }

    await sendVerificationLink(parsed.data.email, { requestIp: callerIp(request) });
    return json(ACCEPTED, 202);
  } catch (error) {
    return handleApiError(error);
  }
}
