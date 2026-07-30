# Runbook — backup, restore, and rollback

Operational procedures for the Hostinger/Docker deployment. Written to be
followed at 3am by someone who did not write the code.

The single most important rule is at the top because it is the one most likely
to be got wrong under pressure:

> **A bad deployment is rolled back by rolling *forward*, not by restoring the
> database.** Restoring loses every booking, payment and message recorded since
> the dump was taken. That is almost always worse than the bug being fixed.

Database restore is for data loss — a dropped table, a corrupted volume, a
destructive migration that reached production. It is not for "the new release
is broken".

---

## 1. Backups

### What runs

`scripts/backup-database.sh` takes a compressed custom-format `pg_dump`,
verifies it, then prunes older archives.

```
0 3 * * * cd /opt/tripistic && \
  DATABASE_URL="postgresql://tripistic:PASSWORD@127.0.0.1:5432/tripistic" \
  BACKUP_DIR=/var/backups/tripistic \
  ./scripts/backup-database.sh >> /var/log/tripistic-backup.log 2>&1
```

Environment:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | — (required) | Source database |
| `BACKUP_DIR` | `/var/backups/tripistic` | Where archives are written |
| `BACKUP_RETENTION_DAYS` | `14` | Archives older than this are pruned |

### Why it is shaped this way

- **Every run verifies the archive** with `pg_restore --list` and asserts it
  contains table data. An unverified backup is a guess; the moment you find out
  a dump was truncated must not be the moment you need it.
- **A failed or unverifiable dump is deleted and the script exits non-zero.**
  The previous good archives are left alone.
- **Pruning happens only after verification succeeds.** Ordering is the whole
  point — a broken backup job that pruned first would quietly destroy the
  history it exists to protect.
- **Custom format**, so a recovery can restore selected tables rather than the
  whole cluster. Real recoveries are usually partial.

### Off-box copies

The script writes locally. **Local backups do not survive the failure mode you
are most afraid of** — losing the VPS. Sync them somewhere else:

```
0 4 * * * rclone sync /var/backups/tripistic remote:tripistic-backups
```

Any S3-compatible target works; the `S3_*` variables the app already uses can
point at the same bucket.

### Verify the backups are real

Monthly, restore the newest archive into a scratch database and confirm the
schema matches. Section 2 is that drill.

---

## 2. Restore

`scripts/restore-database.sh` is deliberately awkward to run:

- the target is **`TARGET_DATABASE_URL`**, never `DATABASE_URL`, so a stray
  invocation on an app host cannot pick up production from the environment;
- it refuses to run without `RESTORE_CONFIRM=yes`;
- it refuses a target whose URL looks like production unless
  `RESTORE_ALLOW_PRODUCTION=yes` is also set;
- it verifies the archive before touching the target.

### Drill (safe — do this monthly)

```
createdb tripistic_restore_drill
RESTORE_CONFIRM=yes \
TARGET_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/tripistic_restore_drill" \
  ./scripts/restore-database.sh /var/backups/tripistic/tripistic-<TIMESTAMP>.dump

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/tripistic_restore_drill" \
  npx prisma migrate status     # expect: "Database schema is up to date!"

dropdb tripistic_restore_drill
```

If `migrate status` reports pending migrations, the backup predates the
current release. That is fine and expected — note which migrations would need
replaying.

### Real recovery

1. **Stop the app** so nothing writes while you work:
   `docker compose -f docker-compose.hostinger.yml stop app worker`
2. **Back up the current broken state first.** You may need it, and you cannot
   get it back later.
3. Restore into a **new** database, not over the live one, then repoint
   `DATABASE_URL`. If the restore turns out to be wrong, the original is still
   there.
4. Run `npx prisma migrate deploy` against the restored database.
5. Start `release`, then `app` and `worker`.
6. **Reconcile payments.** Any Stripe payment taken after the dump exists at
   the provider but not in the restored database. Stripe's dashboard is the
   source of truth; `payment_requires_reconciliation` audit entries and the
   Stripe payments list are where to look.

---

## 3. Rollback (the usual case)

A release is broken. **Do not restore the database.**

### 3a. Roll the application back

Images are built from a git ref. Redeploy the previous known-good commit:

```
cd /opt/tripistic
git fetch origin
git checkout <previous-good-sha>
docker compose -f docker-compose.hostinger.yml up -d --build
```

The `release` service runs first and gates `app` on completing successfully,
so a rollback that cannot migrate will not start a broken app.

### 3b. If the bad release included a migration

This is the case that needs care.

**Never run `prisma migrate resolve --rolled-back` or hand-write a `DROP` to
undo a migration on production.** A destructive down-migration is how a bad
deploy becomes permanent data loss.

Instead:

- **If the migration was additive** (new nullable column, new table, new enum
  value — which is what this codebase's migrations are written to be), the
  previous application version ignores it. Roll the app back and stop. Nothing
  else is required.
- **If the migration was not additive**, write a *new forward* migration that
  restores the behaviour, and deploy that. A forward fix is auditable, testable
  in CI, and reversible in turn.

Additive-only migrations are the reason 3b is usually a non-event. Keep it that
way: prefer a nullable column plus a backfill over an in-place rewrite, and add
enum values rather than redefining the type.

### 3c. If the release is taking payments incorrectly

Ordering matters — money first:

1. Disable checkout: unset `STRIPE_SECRET_KEY` and restart `app`. The release
   check treats missing Stripe as a warning, so the app still serves bookings.
2. Then roll the application back as in 3a.
3. Reconcile in Stripe.

---

## 4. Health and observability during an incident

| Endpoint | Answers | Use for |
| --- | --- | --- |
| `GET /api/health/live` | Is the process up? | Container health check, restarts |
| `GET /api/health/ready` | Is the database reachable? | Load balancer routing |

`/live` deliberately touches nothing else: a liveness probe that fails on a
database blip makes the orchestrator restart a healthy app, turning a
recoverable dependency outage into a crash loop.

**Logs** are one JSON object per line. Every line inside a wrapped request
carries `requestId`, and every line inside a job carries the `JobRun` id as its
`requestId`, so background work correlates the same way:

```
docker compose -f docker-compose.hostinger.yml logs app | grep '"level":"error"'
docker compose -f docker-compose.hostinger.yml logs app | grep '"requestId":"<id>"'
```

Secrets and customer addresses are redacted at the logging boundary
(`lib/observability/logger.ts`), so logs can be shared without scrubbing.

**Scheduled jobs** record every run in `job_runs`. `Admin → System Health`
shows the last run, its outcome and its age per job. A job whose last run is
hours old, or whose recent history is all `skipped`, means the worker is not
running or a lock leaked.

---

## 5. What is not covered yet

Stated plainly so nobody assumes otherwise:

- **Off-box backup sync is not configured** — the cron line in §1 is a
  template, not something this repository sets up.
- **No automated restore drill.** §2's drill is a manual monthly procedure.
- **No alerting.** Nothing pages anyone when a backup fails or a job stops
  running; both are visible only if someone looks.
- **Point-in-time recovery is not available.** These are nightly logical dumps,
  so worst-case data loss is up to 24 hours. WAL archiving would be the fix if
  that window is too wide.
