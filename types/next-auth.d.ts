import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isPlatformAdmin: boolean;
      /** Re-checked against the database so a password reset can invalidate this token. */
      sessionVersion: number;
    } & DefaultSession["user"];
  }

  interface User {
    isPlatformAdmin?: boolean;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId?: string;
    isPlatformAdmin?: boolean;
    sessionVersion?: number;
  }
}
