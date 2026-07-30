import { badRequest, handleApiError, json } from "@/lib/api";
import { verifyEmailWithToken } from "@/lib/auth/account";
import { RATE_LIMITS, callerIp, consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { verifyEmailSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const budget = await consumeRateLimit(RATE_LIMITS.verificationResend, callerIp(request));
    if (!budget.allowed) {
      return json({ error: "Too many attempts. Try again later." }, {
        status: 429,
        headers: rateLimitHeaders(budget),
      });
    }

    const body = await request.json().catch(() => null);
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) throw badRequest("Invalid verification link.");

    const result = await verifyEmailWithToken(parsed.data.token);
    if (!result.ok) throw badRequest("This verification link is no longer valid. Request a new one.");

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
