-- Phase 5-12 hardening: invariants enforced at the database level, not only
-- in the application layer. Not represented in schema.prisma — Prisma's
-- schema DSL has no CHECK-constraint syntax; Prisma Migrate does not model
-- or manage constraints it cannot express, so these survive future
-- `prisma migrate dev` diffs unchanged. Same pattern as migration
-- 20260710193000_availability_capacity_constraints.

-- A CRM task/activity links to at most one of (customer, lead) — never both.
ALTER TABLE "crm_tasks"
  ADD CONSTRAINT "crm_tasks_single_entity_link" CHECK (num_nonnulls("customer_id", "lead_id") <= 1);

ALTER TABLE "crm_activities"
  ADD CONSTRAINT "crm_activities_single_entity_link" CHECK (num_nonnulls("customer_id", "lead_id") = 1);

-- Rating scales are 1-5 inclusive.
ALTER TABLE "guide_ratings"
  ADD CONSTRAINT "guide_ratings_value_range" CHECK ("rating_value" >= 1 AND "rating_value" <= 5);

ALTER TABLE "vendors"
  ADD CONSTRAINT "vendors_rating_range" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5));

-- Non-negative durations/money invariants, matching the existing
-- capacity/booked_count precedent.
ALTER TABLE "staff_time_entries"
  ADD CONSTRAINT "staff_time_entries_minutes_positive" CHECK ("minutes" > 0);

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_capacity_positive" CHECK ("capacity" > 0);

ALTER TABLE "itinerary_items"
  ADD CONSTRAINT "itinerary_items_cost_nonnegative" CHECK ("cost_cents" >= 0);

ALTER TABLE "itinerary_items"
  ADD CONSTRAINT "itinerary_items_price_nonnegative" CHECK ("price_cents" >= 0);

ALTER TABLE "itineraries"
  ADD CONSTRAINT "itineraries_day_count_positive" CHECK ("day_count" > 0);

ALTER TABLE "vendor_invoices"
  ADD CONSTRAINT "vendor_invoices_amount_nonnegative" CHECK ("amount_cents" >= 0);

-- A time-off window's end must not precede its start.
ALTER TABLE "staff_time_off"
  ADD CONSTRAINT "staff_time_off_range_valid" CHECK ("ends_on" >= "starts_on");
