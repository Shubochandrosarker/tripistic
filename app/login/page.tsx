import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Tripistic account."
      footer={
        <>
          New to Tripistic?{" "}
          <Link href="/register" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<LoadingState label="Loading sign in…" className="py-8" />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
