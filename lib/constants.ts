export const BUSINESS_TYPES = [
  "solo_guide",
  "small_operator",
  "multi_guide_operator",
  "rental_activity_business",
  "multi_day_tour_operator",
  "agency",
] as const;

export type BusinessTypeValue = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessTypeValue, string> = {
  solo_guide: "Solo guide",
  small_operator: "Small operator",
  multi_guide_operator: "Multi-guide operator",
  rental_activity_business: "Rental / activity business",
  multi_day_tour_operator: "Multi-day tour operator",
  agency: "Agency",
};

export const WORKSPACE_ROLES = [
  "workspace_owner",
  "workspace_admin",
  "guide",
  "staff",
  "viewer",
] as const;

export type WorkspaceRoleValue = (typeof WORKSPACE_ROLES)[number];

export const ROLE_LABELS: Record<WorkspaceRoleValue, string> = {
  workspace_owner: "Owner",
  workspace_admin: "Admin",
  guide: "Guide",
  staff: "Staff",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRoleValue, string> = {
  workspace_owner: "Full control including billing and members",
  workspace_admin: "Manages daily operations and team",
  guide: "Sees assigned trips and manifests (from Phase 6)",
  staff: "Handles bookings and guest support (from Phase 3)",
  viewer: "Read-only access to dashboards and reports",
};

/** Roles an admin (non-owner) is allowed to grant or manage. */
export const ADMIN_MANAGEABLE_ROLES: WorkspaceRoleValue[] = ["guide", "staff", "viewer"];

export const FEATURE_KEYS = [
  "ai_growth_dashboard",
  "booking_engine",
  "stripe_payments",
  "digital_waivers",
  "guide_scheduling",
  "ota_sync",
  "white_label",
  "custom_domain",
] as const;

export type FeatureKeyValue = (typeof FEATURE_KEYS)[number];

/** Workspace key-value settings the API will accept (Phase 1 allow-list). */
export const SETTING_KEYS = [
  "business_name",
  "default_language",
  "booking_notice_period",
  "cancellation_policy",
  "email_from_name",
  "brand_color",
] as const;

export type SettingKeyValue = (typeof SETTING_KEYS)[number];

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "JPY",
  "SGD",
  "AED",
  "THB",
  "MXN",
  "BRL",
  "ZAR",
  "INR",
  "BDT",
] as const;

export const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Lisbon",
  "Europe/Athens",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "NL", name: "Netherlands" },
  { code: "GR", name: "Greece" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "TH", name: "Thailand" },
  { code: "SG", name: "Singapore" },
  { code: "JP", name: "Japan" },
  { code: "ZA", name: "South Africa" },
  { code: "IN", name: "India" },
  { code: "BD", name: "Bangladesh" },
];

export const TOUR_KINDS = ["tour", "activity", "package"] as const;

export type TourKindValue = (typeof TOUR_KINDS)[number];

export const TOUR_KIND_LABELS: Record<TourKindValue, string> = {
  tour: "Tour",
  activity: "Activity",
  package: "Multi-day package",
};

export const TOUR_STATUSES = ["draft", "active", "archived"] as const;

export const TOUR_VISIBILITIES = ["public", "private"] as const;

export const DAYS_OF_WEEK: Array<{ value: number; label: string; short: string }> = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

/** Default and maximum window (days) for materializing schedule slots. */
export const SLOT_GENERATION_DEFAULT_DAYS = 90;
export const SLOT_GENERATION_MAX_DAYS = 365;

/** Maximum date-range width accepted by any availability query (internal or public). */
export const AVAILABILITY_QUERY_MAX_DAYS = 365;

/* ------------------------------------------------------------------------ */
/* Phase 3 — bookings                                                        */
/* ------------------------------------------------------------------------ */

/** Absolute safe upper bound on a single booking's party size, regardless of tour capacity. */
export const MAX_PARTICIPANTS_PER_BOOKING = 50;

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
] as const;

export type BookingStatusValue = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatusValue, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

export const BOOKING_SOURCES = ["public_direct", "manual"] as const;

export type BookingSourceValue = (typeof BOOKING_SOURCES)[number];

export const BOOKING_SOURCE_LABELS: Record<BookingSourceValue, string> = {
  public_direct: "Direct booking",
  manual: "Manual (operator)",
};

/** Default page size and hard cap for paginated booking list endpoints. */
export const BOOKINGS_PAGE_SIZE_DEFAULT = 20;
export const BOOKINGS_PAGE_SIZE_MAX = 100;

/* ------------------------------------------------------------------------ */
/* Phase 4 — payments                                                        */
/* ------------------------------------------------------------------------ */

export const PAYMENT_STATUSES = [
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;

export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusValue, string> = {
  requires_payment: "Awaiting payment",
  processing: "Processing",
  succeeded: "Paid",
  failed: "Payment failed",
  cancelled: "Payment cancelled",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
};

/** Fallback when `PAYMENT_PENDING_EXPIRY_MINUTES` isn't set in the environment. */
export const DEFAULT_PAYMENT_PENDING_EXPIRY_MINUTES = 30;

/** Stripe's minimum allowed Checkout Session lifetime — sessions cannot expire sooner than this. */
export const STRIPE_MIN_CHECKOUT_SESSION_MINUTES = 30;

/**
 * Currencies Stripe treats as having no fractional/minor unit — amounts for
 * these must NOT be multiplied the way cent-based currencies are internally.
 * This app already stores all money as integer minor units (see docs/03), so
 * for a zero-decimal currency that integer IS the Stripe amount as-is; for
 * every other currency it also already is (both this app and Stripe use
 * "smallest unit" as the wire format) — the list exists so a future
 * currency-conversion helper has one obvious place to branch on, and so unit
 * tests can pin the exact set this app has verified against.
 */
export const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
  "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

/* ------------------------------------------------------------------------ */
/* Phase 5 — CRM & communication                                             */
/* ------------------------------------------------------------------------ */

export const CONSENT_STATUSES = ["subscribed", "unsubscribed", "unknown"] as const;

export type ConsentStatusValue = (typeof CONSENT_STATUSES)[number];

export const CONSENT_STATUS_LABELS: Record<ConsentStatusValue, string> = {
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  unknown: "Not asked",
};

export const MESSAGE_STATUSES = ["queued", "sent", "failed", "skipped"] as const;

export type MessageStatusValue = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_STATUS_LABELS: Record<MessageStatusValue, string> = {
  queued: "Queued",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
};

export const MESSAGE_TEMPLATE_KEYS = [
  "booking_confirmation",
  "booking_reminder",
  "review_request",
  "member_invitation",
] as const;

export type MessageTemplateKeyValue = (typeof MESSAGE_TEMPLATE_KEYS)[number];

export const MESSAGE_TEMPLATE_LABELS: Record<MessageTemplateKeyValue, string> = {
  booking_confirmation: "Booking confirmation",
  booking_reminder: "Departure reminder",
  review_request: "Review request",
  member_invitation: "Team invitation",
};

export const CUSTOMERS_PAGE_SIZE_DEFAULT = 20;
export const CUSTOMERS_PAGE_SIZE_MAX = 100;

export const ACTIVE_WORKSPACE_COOKIE = "tripistic_active_workspace";

export const TRIAL_DAYS = 14;

export const DEFAULT_PLAN_SLUG = "solo";
