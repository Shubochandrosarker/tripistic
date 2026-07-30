import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmailView } from "@/components/auth/verify-email-view";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = {
  title: "Confirm your email",
  // Never indexed: these pages are only ever reached from a link in an email.
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AuthCard
      title="Confirm your email"
      subtitle="One quick step to finish setting up your account."
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
        <VerifyEmailView />
      </Suspense>
    </AuthCard>
  );
}
