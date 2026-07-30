import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = {
  title: "Choose a new password",
  // Never indexed: these pages are only ever reached from a link in an email.
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Your new password signs you out everywhere else."
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
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
