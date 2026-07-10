import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { loginSchema } from "@/lib/validation";
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
        };
      },
    }),
  ],
});
