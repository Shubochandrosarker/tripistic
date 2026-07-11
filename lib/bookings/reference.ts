import { randomBytes } from "node:crypto";

// Excludes visually ambiguous characters (0/O, 1/I/L) so a guest can read a
// reference off a screen or phone call without confusion.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REFERENCE_LENGTH = 8;

/** Random, collision-safe, human-readable booking reference — never a sequential counter. */
export function generateBookingReference(): string {
  const bytes = randomBytes(REFERENCE_LENGTH);
  let out = "";
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    out += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  }
  return out;
}

/** High-entropy (~144 bit) URL-safe token for the public confirmation page. Never sequential, never the booking ID. */
export function generatePublicToken(): string {
  return randomBytes(24).toString("base64url");
}
