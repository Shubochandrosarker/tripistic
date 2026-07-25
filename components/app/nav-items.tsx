import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Car,
  CalendarCheck,
  ClipboardList,
  Globe2,
  CreditCard,
  Cpu,
  HeartPulse,
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
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  Wrench,
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
      { href: "/admin/workspaces", label: "Organizations", icon: Building2 },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/plans", label: "Plans", icon: Layers },
      { href: "/admin/revenue", label: "Revenue", icon: CreditCard },
      { href: "/admin/licenses", label: "Licenses", icon: ShieldAlert },
    ],
  },
  {
    title: "Enterprise",
    items: [
      { href: "/admin/domains", label: "Domains", icon: Globe2 },
      { href: "/admin/white-labels", label: "White Labels", icon: SlidersHorizontal },
      { href: "/admin/ai-providers", label: "AI Providers", icon: Cpu },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/admin/system-health", label: "System Health", icon: HeartPulse },
      { href: "/admin/audit-logs", label: "Audit logs", icon: ScrollText },
      { href: "/admin/maintenance", label: "Maintenance", icon: Wrench },
    ],
  },
];
