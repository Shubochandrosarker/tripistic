import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config — used by middleware. Must not import Prisma or any
 * Node-only module. The full config (with the Credentials provider that talks
 * to the database) lives in lib/auth/auth.ts.
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = nextUrl;

      const isProtected =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/admin") ||
        pathname.startsWith("/workspaces") ||
        pathname.startsWith("/invite");

      if (isProtected) {
        // false → NextAuth redirects to the sign-in page with callbackUrl.
        return isLoggedIn;
      }

      if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.isPlatformAdmin = user.isPlatformAdmin ?? false;
        token.sessionVersion = user.sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId ?? token.sub ?? "";
        session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);
        session.user.sessionVersion = typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
