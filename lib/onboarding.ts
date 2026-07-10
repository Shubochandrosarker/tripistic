export type OnboardingItem = {
  key: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  /** Set when the action depends on a future build phase. */
  phase?: string;
};

export function buildOnboardingChecklist(input: {
  hasWorkspace: boolean;
  memberCount: number;
  tourCount?: number;
  upcomingSlotCount?: number;
}): OnboardingItem[] {
  const tourCount = input.tourCount ?? 0;
  const upcomingSlotCount = input.upcomingSlotCount ?? 0;
  return [
    {
      key: "create_workspace",
      title: "Create your workspace",
      description: "Your business account on Tripistic — done the moment you signed up.",
      href: "/dashboard/settings",
      done: input.hasWorkspace,
    },
    {
      key: "add_first_tour",
      title: "Add your first tour",
      description: "Define what guests can book: title, duration, capacity, and price.",
      href: tourCount > 0 ? "/dashboard/tours" : "/dashboard/tours/new",
      done: tourCount > 0,
    },
    {
      key: "set_availability",
      title: "Set your availability",
      description: "Add a recurring schedule and generate upcoming departures.",
      href: "/dashboard/tours",
      done: upcomingSlotCount > 0,
    },
    {
      key: "connect_stripe",
      title: "Connect Stripe",
      description: "Take payments, deposits, and installments with 0% Tripistic commission.",
      href: "/dashboard/billing",
      done: false,
      phase: "Phase 4",
    },
    {
      key: "customize_booking_page",
      title: "Customize your booking page",
      description: "Brand the page and widget your guests will book through.",
      href: "/dashboard/bookings",
      done: false,
      phase: "Phase 3",
    },
    {
      key: "invite_team",
      title: "Invite staff or a guide",
      description: "Give your team the right level of access with roles.",
      href: "/dashboard/settings#members",
      done: input.memberCount > 1,
    },
    {
      key: "enable_ai_growth",
      title: "Enable the AI Growth Dashboard",
      description: "Get plain-English recommendations to grow direct bookings.",
      href: "/dashboard/ai-growth",
      done: false,
      phase: "Phase 7",
    },
  ];
}

export function onboardingProgress(items: OnboardingItem[]) {
  const done = items.filter((item) => item.done).length;
  return {
    done,
    total: items.length,
    percent: Math.round((done / items.length) * 100),
  };
}
