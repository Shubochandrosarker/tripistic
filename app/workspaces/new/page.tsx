import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getMemberships } from "@/lib/tenancy/workspace";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";

export const metadata: Metadata = {
  title: "Create workspace",
};

export default async function NewWorkspacePage() {
  const user = await requireUserPage();

  // Same gate as the dashboard layout. Without it, an unverified user bounced
  // off /dashboard could still land here and create a workspace.
  if (!user.emailVerifiedAt) {
    redirect("/verify-email");
  }
  const memberships = await getMemberships(user.id);
  const isFirstWorkspace = memberships.length === 0;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Compass className="size-5" aria-hidden />
        </span>
        <span className="text-lg font-semibold tracking-tight text-foreground">Tripistic</span>
      </div>

      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xs">
        <h1 className="text-lg font-semibold text-foreground">
          {isFirstWorkspace ? "Set up your tour business" : "Create a new workspace"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isFirstWorkspace
            ? "This is your business account on Tripistic — bookings, team, and settings will live here. Your 14-day trial starts now."
            : "Add another business account. You can switch between workspaces anytime."}
        </p>
        <div className="mt-6">
          <CreateWorkspaceForm />
        </div>
      </div>

      {!isFirstWorkspace ? (
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href="/dashboard" className="font-medium text-accent hover:underline">
            ← Back to dashboard
          </Link>
        </p>
      ) : null}
    </div>
  );
}
