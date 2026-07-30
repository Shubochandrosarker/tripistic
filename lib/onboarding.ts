export type OnboardingItem = {
  key: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  /**
   * Shown beside an item that cannot be completed yet.
   *
   * Deliberately no longer used. Two items previously carried "Future" and
   * "Phase 7" and were hard-coded `done: false`, which meant an operator who
   * did everything right saw 5/7 forever — a checklist that cannot be
   * completed teaches people to ignore it. It also leaked internal roadmap
   * vocabulary ("Phase 7") into the product, which means nothing to a customer.
   *
   * The field is kept for a genuinely unavailable step in future, but anything
   * using it must be a real step an operator will one day finish.
   */
  phase?: string;
};

export function buildOnboardingChecklist(input: {
  hasWorkspace: boolean;
  memberCount: number;
  tourCount?: number;
  upcomingSlotCount?: number;
  /** At least one active, public tour with a future bookable departure — the real "your booking page works" signal. */
  hasPublicBookableTour?: boolean;
  /** Stripe Connect account with payouts enabled — the real "you get paid" signal. */
  payoutsEnabled?: boolean;
  /** Any booking at all, which is the milestone the whole checklist is for. */
  hasFirstBooking?: boolean;
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
      key: "publish_booking_page",
      title: "Publish your booking page",
      description: "Set a tour to active and public with an upcoming departure so guests can book directly.",
      href: "/dashboard/tours",
      done: input.hasPublicBookableTour ?? false,
    },
    {
      key: "stripe_payouts",
      title: "Connect Stripe for payouts",
      description:
        "Take card payments at checkout and have them paid out to your own bank account, with 0% Tripistic commission on direct bookings.",
      href: "/dashboard/billing",
      // Previously hard-coded false and described as "a future upgrade".
      // Stripe Connect is fully implemented — onboarding link, account status,
      // payout gating and balance are all live (lib/payments/connect.ts) — so
      // this told operators a working feature did not exist and made the step
      // impossible to tick off.
      done: input.payoutsEnabled ?? false,
    },
    {
      key: "invite_team",
      title: "Invite staff or a guide",
      description: "Give your team the right level of access with roles.",
      href: "/dashboard/settings#members",
      done: input.memberCount > 1,
    },
    {
      key: "first_booking",
      title: "Take your first booking",
      description:
        "The finish line for setup. Once a guest has booked, Growth Insights starts reporting on your real occupancy and revenue.",
      href: "/dashboard/bookings",
      // Replaces "Open the Growth Insights dashboard", which was hard-coded
      // false and so could never be ticked. Opening a page is not a setup
      // step anyway; taking a booking is the milestone every other item on
      // this list exists to reach, and it is genuinely completable.
      done: input.hasFirstBooking ?? false,
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
