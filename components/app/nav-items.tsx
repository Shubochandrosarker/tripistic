import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarCheck,
  CreditCard,
  LayoutDashboard,
  Layers,
  Map,
  Rocket,
  ScrollText,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Phase badge for modules that are not live yet. */
  badge?: string;
  exact?: boolean;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const dashboardNav: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/dashboard/onboarding", label: "Onboarding", icon: Rocket },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/dashboard/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/dashboard/tours", label: "Tours", icon: Map },
      { href: "/dashboard/customers", label: "Customers", icon: Users, badge: "Phase 5" },
      { href: "/dashboard/ai-growth", label: "AI Growth", icon: Sparkles, badge: "Phase 7" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
    ],
  },
];

export const adminNav: NavSection[] = [
  {
    items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true }],
  },
  {
    title: "Platform",
    items: [
      { href: "/admin/workspaces", label: "Workspaces", icon: Building2 },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/plans", label: "Plans", icon: Layers },
      { href: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
    ],
  },
];
