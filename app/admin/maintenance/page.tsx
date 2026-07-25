import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePlatformAdminPage } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = {
  title: "Maintenance · Admin",
};

async function updateMaintenanceMode(formData: FormData) {
  "use server";

  const user = await requirePlatformAdminPage();
  const enabled = formData.get("enabled") === "on";
  const message = String(formData.get("message") ?? "").trim();

  await prisma.maintenanceSetting.upsert({
    where: { id: "platform" },
    create: {
      id: "platform",
      enabled,
      message: message || null,
      updatedById: user.id,
    },
    update: {
      enabled,
      message: message || null,
      updatedById: user.id,
    },
  });

  revalidatePath("/admin/maintenance");
  revalidatePath("/admin/system-health");
}

export default async function AdminMaintenancePage() {
  const maintenance =
    (await prisma.maintenanceSetting.findUnique({ where: { id: "platform" } })) ??
    (await prisma.maintenanceSetting.create({
      data: { id: "platform", enabled: false },
    }));

  return (
    <>
      <PageHeader
        title="Maintenance Mode"
        description="Owner-only platform switch for planned downtime and operator-facing incident notices."
        badge={<StatusBadge status={maintenance.enabled ? "enabled" : "disabled"} />}
      />

      <SectionCard title="Platform Switch" description="The runtime enforcement hook is intentionally centralized here for the next middleware pass.">
        <form action={updateMaintenanceMode} className="space-y-4">
          <label className="flex items-center gap-3 rounded-lg border border-border bg-muted/35 p-3 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={maintenance.enabled}
              className="size-4 accent-[var(--accent)]"
            />
            <span>
              <span className="block font-medium text-foreground">Enable maintenance mode</span>
              <span className="text-muted-foreground">Use for planned outages, migrations, or incident response.</span>
            </span>
          </label>

          <Field label="Public message" htmlFor="message" hint="Shown by the maintenance middleware once enforcement is enabled.">
            <Input
              id="message"
              name="message"
              defaultValue={maintenance.message ?? ""}
              placeholder="Tripistic is undergoing scheduled maintenance."
            />
          </Field>

          <Button type="submit" variant="accent">Save maintenance mode</Button>
        </form>
      </SectionCard>
    </>
  );
}
