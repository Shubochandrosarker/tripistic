import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { loginSchema } from "@/lib/validation";
import { logger } from "@/lib/observability/logger";
import { RATE_LIMITS, callerIp, consumeRateLimit } from "@/lib/security/rate-limit";
import { authConfig } from "./config";
import { verifyPassword } from "./passwords";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Two budgets, because they stop different attacks. The caller budget
        // stops one host working through a password list. The account budget
        // stops a rotating botnet doing the same thing against one target —
        // `x-forwarded-for` is client-controllable, so the caller budget alone
        // is a speed bump, while the account being attacked cannot be rotated.
        const ip = request instanceof Request ? callerIp(request) : "unknown";
        const [ipBudget, accountBudget] = await Promise.all([
          consumeRateLimit(RATE_LIMITS.login, ip),
          consumeRateLimit(RATE_LIMITS.loginPerAccount, `email:${parsed.data.email}`),
        ]);
        if (!ipBudget.allowed || !accountBudget.allowed) {
          logger.warn("auth.login_rate_limited", { scope: ipBudget.allowed ? "account" : "ip" });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user || !user.passwordHash || user.deletedAt || user.status !== "active") {
          return null;
        }

        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await recordAuditEvent({ action: "user_login", userId: user.id, request });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.avatarUrl,
          isPlatformAdmin: user.isPlatformAdmin,
          // Carried in the JWT and re-checked on every request, so a password
          // reset can invalidate sessions that were issued before it.
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});
