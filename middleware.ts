import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

// Edge middleware uses the DB-free config; the `authorized` callback handles
// redirects. API routes and server layouts perform their own (stronger) checks.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/workspaces/:path*",
    "/invite/:path*",
    "/login",
    "/register",
  ],
};
