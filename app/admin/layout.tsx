import { requirePlatformAdminPage } from "@/lib/auth/guards";
import { AppShell } from "@/components/app/app-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Platform admin is re-verified against the database on every request.
  const user = await requirePlatformAdminPage();

  return (
    <AppShell
      variant="admin"
      user={{
        name: user.name,
        email: user.email,
        isPlatformAdmin: user.isPlatformAdmin,
      }}
    >
      {children}
    </AppShell>
  );
}
