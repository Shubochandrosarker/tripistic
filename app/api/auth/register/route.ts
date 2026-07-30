import { prisma } from "@/lib/db";
import { conflict, handleApiError, json } from "@/lib/api";
import { hashPassword } from "@/lib/auth/passwords";
import { sendVerificationLink } from "@/lib/auth/account";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { RATE_LIMITS, callerIp, consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";
import { registerSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Registration writes a row and sends an email per call, so an unlimited
    // endpoint is both a database-filling vector and a way to use this
    // platform to mail arbitrary addresses.
    const budget = await consumeRateLimit(RATE_LIMITS.register, callerIp(request));
    if (!budget.allowed) {
      return json({ error: "Too many sign-up attempts. Try again later." }, {
        status: 429,
        headers: rateLimitHeaders(budget),
      });
    }

    const body = await request.json().catch(() => null);
    const data = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      // Registration is the one place account existence cannot be hidden: the
      // address either becomes an account or it does not, and the caller
      // finds out either way. A generic "check your email" here would leave
      // someone whose address is already registered with no way to understand
      // why they never receive anything.
      throw conflict("An account with this email already exists. Try signing in instead.");
    }

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
      },
    });

    await recordAuditEvent({
      action: "user_registered",
      userId: user.id,
      entityType: "user",
      entityId: user.id,
      request,
    });

    // Best effort: a failed send must not fail the registration. The account
    // exists, and the verification email is retried by the outbox or can be
    // re-requested — losing the account because SMTP blipped would be worse.
    await sendVerificationLink(user.email, { requestIp: callerIp(request) }).catch((error) =>
      logger.error("auth.verification_send_failed", { userId: user.id }, error),
    );

    return json({ ok: true, verificationRequired: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
