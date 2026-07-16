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
  "departure_delayed",
] as const;

export type MessageTemplateKeyValue = (typeof MESSAGE_TEMPLATE_KEYS)[number];

export const MESSAGE_TEMPLATE_LABELS: Record<MessageTemplateKeyValue, string> = {
  booking_confirmation: "Booking confirmation",
  booking_reminder: "Departure reminder",
  review_request: "Review request",
  member_invitation: "Team invitation",
  departure_delayed: "Departure delayed",
};

export const CUSTOMERS_PAGE_SIZE_DEFAULT = 20;
export const CUSTOMERS_PAGE_SIZE_MAX = 100;

export const ACTIVE_WORKSPACE_COOKIE = "tripistic_active_workspace";

export const TRIAL_DAYS = 14;

export const DEFAULT_PLAN_SLUG = "solo";

/* ------------------------------------------------------------------------ */
/* Phase 6 — Guides & waivers                                               */
/* ------------------------------------------------------------------------ */

export const GUIDE_CERTIFICATIONS_MAX = 20;

/** ~1.5MB of raw PNG bytes as base64 — generous for a signature-pad drawing, small enough to guard against abuse. */
export const MAX_SIGNATURE_IMAGE_LENGTH = 2_000_000;

export const WAIVER_BODY_TEXT_MAX = 20_000;

/* ------------------------------------------------------------------------ */
/* Phase 5 (extended) — CRM: companies, leads, tasks, activity timeline     */
/* ------------------------------------------------------------------------ */

export const COMPANY_KINDS = ["travel_agent", "hotel", "partner", "other"] as const;

export type CompanyKindValue = (typeof COMPANY_KINDS)[number];

export const COMPANY_KIND_LABELS: Record<CompanyKindValue, string> = {
  travel_agent: "Travel agent",
  hotel: "Hotel",
  partner: "Partner",
  other: "Other",
};

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "won",
  "lost",
] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatusValue, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
};

/** Terminal pipeline stages — a lead in one of these no longer shows in the active pipeline view. */
export const LEAD_CLOSED_STATUSES: readonly LeadStatusValue[] = ["won", "lost"];

export const CRM_TASK_STATUSES = ["open", "done"] as const;

export type CrmTaskStatusValue = (typeof CRM_TASK_STATUSES)[number];

export const CRM_ACTIVITY_TYPES = [
  "note",
  "call",
  "email",
  "whatsapp",
  "sms",
  "meeting",
  "status_change",
] as const;

export type CrmActivityTypeValue = (typeof CRM_ACTIVITY_TYPES)[number];

export const CRM_ACTIVITY_TYPE_LABELS: Record<CrmActivityTypeValue, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
  meeting: "Meeting",
  status_change: "Status change",
};

export const COMPANIES_PAGE_SIZE_DEFAULT = 20;
export const COMPANIES_PAGE_SIZE_MAX = 100;
export const LEADS_PAGE_SIZE_DEFAULT = 20;
export const LEADS_PAGE_SIZE_MAX = 100;
export const CRM_TASKS_PAGE_SIZE_DEFAULT = 20;
export const CRM_TASKS_PAGE_SIZE_MAX = 100;
export const CRM_TIMELINE_PAGE_SIZE_DEFAULT = 25;
export const CRM_TIMELINE_PAGE_SIZE_MAX = 100;

/* ------------------------------------------------------------------------ */
/* Phase 6 (extended) — Workforce management                                */
/* ------------------------------------------------------------------------ */

export const GUIDE_KINDS = ["guide", "driver", "both"] as const;

export type GuideKindValue = (typeof GUIDE_KINDS)[number];

export const GUIDE_KIND_LABELS: Record<GuideKindValue, string> = {
  guide: "Guide",
  driver: "Driver",
  both: "Guide & driver",
};

export const STAFF_EMPLOYMENT_TYPES = ["employee", "freelancer", "contractor"] as const;

export type StaffEmploymentTypeValue = (typeof STAFF_EMPLOYMENT_TYPES)[number];

export const STAFF_EMPLOYMENT_TYPE_LABELS: Record<StaffEmploymentTypeValue, string> = {
  employee: "Employee",
  freelancer: "Freelancer",
  contractor: "Contractor",
};

export const TIME_OFF_STATUSES = ["requested", "approved", "declined"] as const;

export type TimeOffStatusValue = (typeof TIME_OFF_STATUSES)[number];

export const TIME_OFF_STATUS_LABELS: Record<TimeOffStatusValue, string> = {
  requested: "Requested",
  approved: "Approved",
  declined: "Declined",
};

export const STAFF_LANGUAGES_MAX = 20;
export const STAFF_SKILLS_MAX = 20;

/** A shift longer than this is flagged unrealistic by the time-entry form/validation. */
export const STAFF_TIME_ENTRY_MAX_MINUTES = 16 * 60;

/** Weekly worked minutes above this trips the "overtime" penalty in AI guide/driver matching. */
export const STAFF_WEEKLY_OVERTIME_THRESHOLD_MINUTES = 40 * 60;

/* ------------------------------------------------------------------------ */
/* Phase 7 — Vehicle management                                             */
/* ------------------------------------------------------------------------ */

export const VEHICLE_TYPES = ["car", "van", "minibus", "bus", "boat", "other"] as const;

export type VehicleTypeValue = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_TYPE_LABELS: Record<VehicleTypeValue, string> = {
  car: "Car",
  van: "Van",
  minibus: "Minibus",
  bus: "Bus",
  boat: "Boat",
  other: "Other",
};

export const VEHICLE_STATUSES = ["active", "maintenance", "retired"] as const;

export type VehicleStatusValue = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_STATUS_LABELS: Record<VehicleStatusValue, string> = {
  active: "Active",
  maintenance: "In maintenance",
  retired: "Retired",
};

export const MAINTENANCE_TYPES = ["service", "repair", "inspection"] as const;

export type MaintenanceTypeValue = (typeof MAINTENANCE_TYPES)[number];

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceTypeValue, string> = {
  service: "Service",
  repair: "Repair",
  inspection: "Inspection",
};

/** Insurance/registration/maintenance due within this many days surfaces as an alert. */
export const VEHICLE_EXPIRY_WARNING_DAYS = 30;

export const VEHICLES_PAGE_SIZE_DEFAULT = 20;
export const VEHICLES_PAGE_SIZE_MAX = 100;

/* ------------------------------------------------------------------------ */
/* Phase 8/9 — Operations Center & Dispatch Center                          */
/* ------------------------------------------------------------------------ */

export const OPS_STATUSES = [
  "scheduled",
  "boarding",
  "in_progress",
  "delayed",
  "completed",
  "cancelled",
] as const;

export type OpsStatusValue = (typeof OPS_STATUSES)[number];

export const OPS_STATUS_LABELS: Record<OpsStatusValue, string> = {
  scheduled: "Scheduled",
  boarding: "Boarding",
  in_progress: "Running",
  delayed: "Delayed",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Valid manual ops-status transitions — mirrors BOOKING_STATUSES' transition-guard approach. */
export const OPS_STATUS_TRANSITIONS: Record<OpsStatusValue, OpsStatusValue[]> = {
  scheduled: ["boarding", "delayed", "cancelled"],
  boarding: ["in_progress", "delayed", "cancelled"],
  in_progress: ["delayed", "completed", "cancelled"],
  delayed: ["boarding", "in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const OPS_EVENT_TYPES = [
  "status_changed",
  "note",
  "delay_reported",
  "checkin",
  "incident_reported",
  "route_changed",
  "customer_notified",
] as const;

export type OpsEventTypeValue = (typeof OPS_EVENT_TYPES)[number];

export const OPS_EVENT_TYPE_LABELS: Record<OpsEventTypeValue, string> = {
  status_changed: "Status changed",
  note: "Note",
  delay_reported: "Delay reported",
  checkin: "Guest checked in",
  incident_reported: "Incident reported",
  route_changed: "Route changed",
  customer_notified: "Guests notified",
};

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type IncidentSeverityValue = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverityValue, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const INCIDENT_CATEGORIES = [
  "medical",
  "vehicle",
  "weather",
  "guest_behavior",
  "other",
] as const;

export type IncidentCategoryValue = (typeof INCIDENT_CATEGORIES)[number];

export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategoryValue, string> = {
  medical: "Medical",
  vehicle: "Vehicle",
  weather: "Weather",
  guest_behavior: "Guest behavior",
  other: "Other",
};

export const INCIDENT_STATUSES = ["open", "investigating", "resolved"] as const;

export type IncidentStatusValue = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_STATUS_LABELS: Record<IncidentStatusValue, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved: "Resolved",
};

export const INCIDENTS_PAGE_SIZE_DEFAULT = 20;
export const INCIDENTS_PAGE_SIZE_MAX = 100;

/* ------------------------------------------------------------------------ */
/* Phase 10 — Vendor management                                             */
/* ------------------------------------------------------------------------ */

export const VENDOR_KINDS = ["hotel", "restaurant", "transport", "activity_provider", "other"] as const;

export type VendorKindValue = (typeof VENDOR_KINDS)[number];

export const VENDOR_KIND_LABELS: Record<VendorKindValue, string> = {
  hotel: "Hotel",
  restaurant: "Restaurant",
  transport: "Transport",
  activity_provider: "Activity provider",
  other: "Other",
};

export const VENDOR_INVOICE_STATUSES = ["unpaid", "paid", "overdue", "cancelled"] as const;

export type VendorInvoiceStatusValue = (typeof VENDOR_INVOICE_STATUSES)[number];

export const VENDOR_INVOICE_STATUS_LABELS: Record<VendorInvoiceStatusValue, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export const VENDORS_PAGE_SIZE_DEFAULT = 20;
export const VENDORS_PAGE_SIZE_MAX = 100;
export const VENDOR_INVOICES_PAGE_SIZE_DEFAULT = 20;
export const VENDOR_INVOICES_PAGE_SIZE_MAX = 100;

/* ------------------------------------------------------------------------ */
/* Phase 11 — AI Itinerary Builder                                          */
/* ------------------------------------------------------------------------ */

export const ITINERARY_STATUSES = ["draft", "shared", "confirmed", "archived"] as const;

export type ItineraryStatusValue = (typeof ITINERARY_STATUSES)[number];

export const ITINERARY_STATUS_LABELS: Record<ItineraryStatusValue, string> = {
  draft: "Draft",
  shared: "Shared",
  confirmed: "Confirmed",
  archived: "Archived",
};

export const ITINERARY_ITEM_TYPES = [
  "accommodation",
  "meal",
  "activity",
  "transfer",
  "flight",
  "guide",
  "vehicle",
  "other",
] as const;

export type ItineraryItemTypeValue = (typeof ITINERARY_ITEM_TYPES)[number];

export const ITINERARY_ITEM_TYPE_LABELS: Record<ItineraryItemTypeValue, string> = {
  accommodation: "Accommodation",
  meal: "Meal",
  activity: "Activity",
  transfer: "Transfer",
  flight: "Flight",
  guide: "Guide",
  vehicle: "Vehicle",
  other: "Other",
};

export const ITINERARY_MAX_DAYS = 60;
export const ITINERARY_MAX_TRAVELERS = 200;
export const ITINERARIES_PAGE_SIZE_DEFAULT = 20;
export const ITINERARIES_PAGE_SIZE_MAX = 100;

/* ------------------------------------------------------------------------ */
/* Phase 12 — AI Business Brain                                             */
/* ------------------------------------------------------------------------ */

/** Months of payment history the revenue forecast/seasonality views look back over. */
export const BUSINESS_BRAIN_HISTORY_MONTHS = 12;
/** How many months ahead the simple moving-average forecast projects. */
export const BUSINESS_BRAIN_FORECAST_MONTHS = 3;
/** A departure at or below this booked/capacity ratio is flagged "underbooked" for pricing suggestions. */
export const LOW_OCCUPANCY_THRESHOLD = 0.4;
/** A departure at or above this booked/capacity ratio is flagged "high demand" for pricing suggestions. */
export const HIGH_OCCUPANCY_THRESHOLD = 0.85;
