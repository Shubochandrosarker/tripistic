#!/bin/sh
# Take a compressed, verified logical backup of the PostgreSQL database.
#
# Designed to run from the host cron on the Hostinger VPS, against the
# `db` container:
#
#   0 3 * * * cd /opt/tripistic && ./scripts/backup-database.sh >> /var/log/tripistic-backup.log 2>&1
#
# Or inside the tooling image, where pg_dump is already present.
#
# Three properties matter, and only the first is obvious:
#
#   1. The dump exists.
#   2. The dump is READABLE. An unverified backup is a guess, and the moment
#      you discover a truncated dump must not be the moment you need it. Every
#      run therefore lists the archive's table of contents before accepting it.
#   3. Old dumps are pruned, but ONLY after a new one has been verified —
#      otherwise a failing backup silently eats the good history behind it.
#
# Custom format (-Fc) rather than plain SQL: it is compressed, and it allows
# selective restore of individual tables, which is what an actual recovery
# usually needs (one workspace's rows, not the whole cluster).

set -eu

BACKUP_DIR="${BACKUP_DIR:-/var/backups/tripistic}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${BACKUP_DIR}/tripistic-${TIMESTAMP}.dump"

log() { echo "[backup] $*"; }
fail() { echo "[backup] ERROR: $*" >&2; exit 1; }

[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set"

mkdir -p "$BACKUP_DIR" || fail "cannot create ${BACKUP_DIR}"

log "dumping to ${ARCHIVE}"
# --no-owner / --no-privileges so the dump restores cleanly into a database
# whose role names differ from production's — which is exactly the situation
# during a restore drill on a staging box.
if ! pg_dump --format=custom --compress=9 --no-owner --no-privileges \
    --file="$ARCHIVE" "$DATABASE_URL"; then
  rm -f "$ARCHIVE"
  fail "pg_dump failed; partial archive removed"
fi

# Verification. `pg_restore --list` parses the archive's table of contents and
# fails on a truncated or corrupt file, without touching any database.
log "verifying archive"
if ! pg_restore --list "$ARCHIVE" > /dev/null 2>&1; then
  rm -f "$ARCHIVE"
  fail "archive failed verification and was discarded — the previous backups are untouched"
fi

TABLE_COUNT="$(pg_restore --list "$ARCHIVE" | grep -c 'TABLE DATA' || true)"
if [ "$TABLE_COUNT" -lt 1 ]; then
  rm -f "$ARCHIVE"
  fail "archive contains no table data and was discarded"
fi

SIZE="$(du -h "$ARCHIVE" | cut -f1)"
log "verified: ${TABLE_COUNT} table(s) with data, ${SIZE}"

# Prune only now that a good backup exists. Ordering is the whole point: a
# broken backup job that pruned first would quietly destroy the history it was
# supposed to protect.
log "pruning backups older than ${RETENTION_DAYS} day(s)"
find "$BACKUP_DIR" -name 'tripistic-*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete || true

REMAINING="$(find "$BACKUP_DIR" -name 'tripistic-*.dump' -type f | wc -l | tr -d ' ')"
log "complete — ${REMAINING} backup(s) retained in ${BACKUP_DIR}"
