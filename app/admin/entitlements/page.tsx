import type { Metadata } from "next";
import { KeyRound, ShieldCheck, TimerReset } from "lucide-react";

import { prisma } from "@/lib/db";
import { NON_PLAN_OVERRIDE_KEYS, PLAN_FEATURE_KEYS } from "@/lib/plans/catalog";
import { formatDateTime } from "@/lib/utils";
import { FeatureOverrideForm, type OverrideRow } from "@/components/admin/feature-override-form";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export const metadata: Metadata = { title: "Entitlements · Admin" };

/**
 * Per-workspace feature overrides.
 *
 * Only workspaces that already have at least one override get a form on this
 * page, plus a picker for adding one to any workspace. Rendering an override
 * form for every workspace on the platform would be an unbounded page, and the
 * common case — "extend this customer's trial of the Copilot" — starts from
 * knowing which customer.
 */
export default async function AdminEntitlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { workspace: selectedSlug } = await searchParams;

  const featureKeys = [...PLAN_FEATURE_KEYS, ...NON_PLAN_OVERRIDE_KEYS].sort();

  const [overrides, workspaces, expiringSoon] = await Promise.all([
    prisma.featureFlag.findMany({
      where: { workspaceId: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        workspace: { select: { id: true, name: true, slug: true } },
        grantedBy: { select: { name: true, email: true } },
      },
    }),
    prisma.workspace.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, slug: true },
    }),
    prisma.featureFlag.count({
      where: {
        workspaceId: { not: null },
        expiresAt: { gt: new Date(), lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const activeCount = overrides.filter(
    (override) => override.expiresAt === null || override.expiresAt.getTime() > Date.now(),
  ).length;

  const selected =
    workspaces.find((candidate) => candidate.slug === selectedSlug) ??
    (overrides[0]?.workspace ? workspaces.find((c) => c.id === overrides[0].workspace?.id) : undefined) ??
    workspaces[0];

  const selectedOverrides: OverrideRow[] = overrides
    .filter((override) => override.workspaceId === selected?.id)
    .map((override) => ({
      id: override.id,
      featureKey: override.featureKey,
      enabled: override.enabled,
      expiresAt: override.expiresAt?.toISOString() ?? null,
      expired: override.expiresAt !== null && override.expiresAt.getTime() <= Date.now(),
      reason: override.reason,
      grantedBy: override.grantedBy?.name ?? override.grantedBy?.email ?? null,
    }));

  return (
    <>
      <PageHeader
        title="Entitlements"
        description="Grant a feature to one workspace for a bounded period, or switch one off. Every change is audited with a reason."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={KeyRound} label="Active overrides" value={String(activeCount)} hint="Across all workspaces" />
        <MetricCard icon={TimerReset} label="Expiring in 7 days" value={String(expiringSoon)} hint="Will fall back to the plan" />
        <MetricCard
          icon={ShieldCheck}
          label="Grantable keys"
          value={String(featureKeys.length)}
          hint="Validated server-side"
        />
      </div>

      <SectionCard
        title="Workspace"
        description="Pick a workspace to see and change its overrides."
      >
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Workspace
            <select
              name="workspace"
              defaultValue={selected?.slug ?? ""}
              className="mt-1 w-72 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            >
              {workspaces.map((candidate) => (
                <option key={candidate.id} value={candidate.slug}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
          >
            Show
          </button>
        </form>
      </SectionCard>

      {selected ? (
        <SectionCard
          title={`Overrides — ${selected.name}`}
          description="An expired override stops applying on its own; nothing has to run to clean it up."
        >
          <FeatureOverrideForm
            workspaceId={selected.id}
            featureKeys={featureKeys}
            overrides={selectedOverrides}
          />
        </SectionCard>
      ) : (
        <SectionCard title="Overrides">
          <p className="text-sm text-muted-foreground">No workspaces yet.</p>
        </SectionCard>
      )}

      <SectionCard title="All recent overrides" description="Across every workspace, newest first.">
        <ul className="space-y-1.5 text-sm">
          {overrides.slice(0, 40).map((override) => (
            <li
              key={override.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
            >
              <span>
                <span className="text-foreground">{override.workspace?.name ?? "—"}</span>
                <span className="ml-2 text-muted-foreground">{override.featureKey}</span>
                <span className="ml-2 text-muted-foreground">
                  {override.enabled ? "granted" : "denied"}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {override.expiresAt
                  ? override.expiresAt.getTime() > Date.now()
                    ? `until ${formatDateTime(override.expiresAt)}`
                    : `expired ${formatDateTime(override.expiresAt)}`
                  : "permanent"}
              </span>
            </li>
          ))}
          {overrides.length === 0 ? (
            <li className="text-muted-foreground">No overrides recorded.</li>
          ) : null}
        </ul>
      </SectionCard>
    </>
  );
}
