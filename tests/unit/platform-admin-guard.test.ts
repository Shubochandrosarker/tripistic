import { describe, expect, it } from "vitest";

import { canRevokePlatformAdmin } from "@/lib/admin/platform-actions";

/**
 * Phase 11 — the two refusals that stop a platform admin locking the platform's
 * own operators out of it.
 *
 * Tested here rather than through the database because proving "this is the
 * last admin" end to end means making one user the *only* platform admin on a
 * database that concurrently running integration files are also using. That
 * arrangement would break them, and a test that corrupts its neighbours is a
 * worse outcome than one that exercises the rule directly.
 *
 * The query that supplies `remainingAdmins` is covered by
 * tests/integration/admin-platform-actions.test.ts.
 */

describe("canRevokePlatformAdmin", () => {
  it("allows revocation when someone else is still an admin", () => {
    expect(canRevokePlatformAdmin({ isSelf: false, remainingAdmins: 1 })).toEqual({ allowed: true });
    expect(canRevokePlatformAdmin({ isSelf: false, remainingAdmins: 9 })).toEqual({ allowed: true });
  });

  it("refuses self-revocation", () => {
    // The usual way to discover this was a mistake is to no longer be able to
    // undo it.
    expect(canRevokePlatformAdmin({ isSelf: true, remainingAdmins: 5 })).toEqual({
      allowed: false,
      reason: "self",
    });
  });

  it("refuses to remove the last admin", () => {
    // Would leave the platform with no way in short of a database session.
    expect(canRevokePlatformAdmin({ isSelf: false, remainingAdmins: 0 })).toEqual({
      allowed: false,
      reason: "last_admin",
    });
  });

  it("reports self-revocation first when both rules apply", () => {
    // A sole admin revoking themselves trips both. "You cannot remove your own
    // access" is the actionable message; "grant access to someone else first"
    // would be advice they cannot act on for themselves.
    expect(canRevokePlatformAdmin({ isSelf: true, remainingAdmins: 0 })).toEqual({
      allowed: false,
      reason: "self",
    });
  });

  it("treats a negative count as no remaining admins rather than allowing it", () => {
    // Defensive: a count can only be >= 0 from the database, but a `< 1` test
    // fails safe where `=== 0` would let a nonsense value through.
    expect(canRevokePlatformAdmin({ isSelf: false, remainingAdmins: -1 })).toEqual({
      allowed: false,
      reason: "last_admin",
    });
  });
});
