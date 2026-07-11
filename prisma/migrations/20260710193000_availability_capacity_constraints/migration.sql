-- Phase 2.1 hardening: capacity invariants enforced at the database level,
-- not only in the application layer. Not represented in schema.prisma —
-- Prisma's schema DSL has no CHECK-constraint syntax; Prisma Migrate does
-- not model or manage constraints it cannot express, so this survives future
-- `prisma migrate dev` diffs unchanged.

ALTER TABLE "availabilities"
  ADD CONSTRAINT "availabilities_capacity_positive" CHECK ("capacity" > 0);

ALTER TABLE "availabilities"
  ADD CONSTRAINT "availabilities_booked_count_nonnegative" CHECK ("booked_count" >= 0);

ALTER TABLE "availabilities"
  ADD CONSTRAINT "availabilities_booked_count_le_capacity" CHECK ("booked_count" <= "capacity");
