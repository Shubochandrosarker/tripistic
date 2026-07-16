import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Car,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  Handshake,
  HardHat,
  LayoutDashboard,
  Layers,
  ListChecks,
  Map,
  Radio,
  Rocket,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
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
      { href: "/dashboard/operations", label: "Operations Center", icon: Radio },
      { href: "/dashboard/incidents", label: "Dispatch", icon: ShieldAlert },
      { href: "/dashboard/manifest", label: "My Manifest", icon: ClipboardList },
    ],
  },
  {
    title: "CRM",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: Users },
      { href: "/dashboard/leads", label: "Leads", icon: Target },
      { href: "/dashboard/companies", label: "Companies", icon: Building2 },
      { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks },
    ],
  },
  {
    title: "Resources",
    items: [
      { href: "/dashboard/guides", label: "Guides & Drivers", icon: HardHat },
      { href: "/dashboard/vehicles", label: "Fleet", icon: Car },
      { href: "/dashboard/vendors", label: "Vendors", icon: Handshake },
    ],
  },
  {
    title: "Growth",
    items: [
      { href: "/dashboard/itineraries", label: "Itineraries", icon: Sparkles },
      { href: "/dashboard/ai-growth", label: "AI Growth", icon: Sparkles },
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
