import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = {
  title: "Reset your password",
  // Never indexed: these pages are only ever reached from a link in an email.
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we will send you a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<LoadingState label="Loading…" className="py-8" />}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
