#!/bin/sh
# Restore a backup taken by scripts/backup-database.sh.
#
#   ./scripts/restore-database.sh /var/backups/tripistic/tripistic-20260730T030000Z.dump
#
# Deliberately awkward to run against production. Restoring is a destructive
# operation — it replaces live rows with older ones — and the common case for
# needing this script is a restore *drill* into a scratch database, not a real
# recovery. So:
#
#   * the target is TARGET_DATABASE_URL, never DATABASE_URL, so a stray
#     invocation on an app host cannot pick up production from the
#     environment;
#   * it refuses to run without RESTORE_CONFIRM=yes;
#   * it refuses a target that looks like production unless
#     RESTORE_ALLOW_PRODUCTION=yes is also set.
#
# For a bad *deployment*, this is the wrong tool. Roll forward instead — see
# docs/RUNBOOK-BACKUP-AND-ROLLBACK.md. A database restore loses every booking
# and payment taken since the dump, which is almost always worse than the bug
# being fixed.

set -eu

ARCHIVE="${1:-}"

log() { echo "[restore] $*"; }
fail() { echo "[restore] ERROR: $*" >&2; exit 1; }

[ -n "$ARCHIVE" ] || fail "usage: $0 <archive.dump>"
[ -f "$ARCHIVE" ] || fail "archive not found: ${ARCHIVE}"
[ -n "${TARGET_DATABASE_URL:-}" ] || fail "TARGET_DATABASE_URL is not set (deliberately not DATABASE_URL)"

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  fail "refusing to restore without RESTORE_CONFIRM=yes — this REPLACES data in the target database"
fi

case "$TARGET_DATABASE_URL" in
  *prod*|*production*)
    if [ "${RESTORE_ALLOW_PRODUCTION:-}" != "yes" ]; then
      fail "target looks like production. Set RESTORE_ALLOW_PRODUCTION=yes only if you have accepted the data loss."
    fi
    ;;
esac

log "verifying archive before touching the target"
pg_restore --list "$ARCHIVE" > /dev/null 2>&1 || fail "archive is unreadable — do not proceed"

log "restoring ${ARCHIVE}"
# --clean --if-exists drops objects before recreating them, so a restore into
# a non-empty database is deterministic rather than a partial merge.
# --exit-on-error so a failure stops here instead of leaving a half-restored
# schema that looks like it worked.
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error \
  --dbname="$TARGET_DATABASE_URL" "$ARCHIVE"

log "restored. Run 'npx prisma migrate status' against the target before pointing an app at it."
