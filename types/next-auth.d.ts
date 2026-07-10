import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isPlatformAdmin: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    isPlatformAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId?: string;
    isPlatformAdmin?: boolean;
  }
}
