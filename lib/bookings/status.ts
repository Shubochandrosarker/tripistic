import type { BookingStatus } from "@prisma/client";

/**
 * Centralized booking status state machine. This is the single source of
 * truth for which transitions are allowed — services and routes must not
 * duplicate this table.
 *
 *   pending   -> confirmed | cancelled
 *   confirmed -> cancelled | completed | no_show
 *   cancelled -> (terminal)
 *   completed -> (terminal)
 *   no_show   -> (terminal)
 */
const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "completed", "no_show"],
  cancelled: [],
  completed: [],
  no_show: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStatus(status: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

/** `pending` and `confirmed` both hold a seat; nothing else does. */
export function holdsCapacity(status: BookingStatus): boolean {
  return status === "pending" || status === "confirmed";
}
