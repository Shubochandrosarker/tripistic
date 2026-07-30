import { badRequest, handleApiError, json } from "@/lib/api";
import { resetPasswordWithToken } from "@/lib/auth/account";
import { RATE_LIMITS, callerIp, consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { passwordResetConfirmSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Completes a password reset.
 *
 * Rate limited so the 256-bit token cannot be brute forced by volume — it
 * could not be anyway at that entropy, but an unlimited endpoint that runs a
 * password hash per call is a cheap way to exhaust the server's CPU.
 */
export async function POST(request: Request) {
  try {
    const budget = await consumeRateLimit(RATE_LIMITS.passwordResetConfirm, callerIp(request));
    if (!budget.allowed) {
      return json({ error: "Too many attempts. Try again later." }, {
        status: 429,
        headers: rateLimitHeaders(budget),
      });
    }

    const body = await request.json().catch(() => null);
    const parsed = passwordResetConfirmSchema.safeParse(body);
    if (!parsed.success) {
      const passwordIssue = parsed.error.issues.find((issue) => issue.path[0] === "password");
      throw badRequest(passwordIssue?.message ?? "Invalid request.");
    }

    const result = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
    if (!result.ok) {
      // One message for expired, already-used and never-existed. Telling them
      // apart would let a guess learn it was close, and would confirm that a
      // token harvested from a mail archive had been used by its owner.
      throw badRequest("This reset link is no longer valid. Request a new one.");
    }

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
