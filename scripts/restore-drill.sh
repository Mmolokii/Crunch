#!/usr/bin/env bash
# Restore drill (CRU-58): proves an encrypted backup from scripts/backup-db.sh
# can actually be restored, by restoring it into the LOCAL Supabase stack.
# The local schema is built from supabase/migrations, the same way a
# replacement project would be, so a drill that passes here is the restore
# the runbook describes. Never touches a hosted project.
#
# Needs: the local stack running (bun run db:start), Docker, openssl, and
# BACKUP_PASSPHRASE.
#
# Usage:
#   BACKUP_PASSPHRASE=... scripts/restore-drill.sh [path/to/crunch-<stamp>.dump.enc]
#   (defaults to the newest dump in BACKUP_DIR, ~/CrunchBackups)
#
# It replaces the local database's data with the dump's: public (the app's
# tables) plus auth.users and auth.identities (accounts). GoTrue's own
# bookkeeping tables are skipped. The decrypted dump is streamed, never
# written to disk. A production dump holds students' personal information,
# so run `bun run db:reset` when you're done to wipe it.
set -euo pipefail

die() { echo "restore-drill: $*" >&2; exit 1; }

[[ -n "${BACKUP_PASSPHRASE:-}" ]] || die "set BACKUP_PASSPHRASE"
dir="${BACKUP_DIR:-$HOME/CrunchBackups}"
file="${1:-$(find "$dir" -name 'crunch-*.dump.enc' -type f 2>/dev/null | sort | tail -1)}"
[[ -n "$file" && -f "$file" ]] || die "no dump found (looked in $dir); pass one as an argument"

project_id="$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' supabase/config.toml)"
db="supabase_db_$project_id"
docker exec "$db" true 2>/dev/null || die "the local stack isn't running: bun run db:start"

DEC=(openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$file")
"${DEC[@]}" >/dev/null 2>&1 || die "couldn't decrypt $file (wrong passphrase?)"

echo "restore-drill: rebuilding the local schema from the migrations (no seed)"
bunx supabase@2.120.0 db reset --no-seed >/dev/null

# Only the app's data: every table in public, and the accounts in auth.
toc="$("${DEC[@]}" | docker exec -i "$db" pg_restore --list \
  | grep -E '(TABLE DATA|SEQUENCE SET) public |TABLE DATA auth (users|identities) ')" \
  || die "the dump has no public or auth data"
printf '%s\n' "$toc" | docker exec -i "$db" sh -c 'cat > /tmp/restore-drill.toc'

echo "restore-drill: restoring $(basename "$file")"
start=$(date +%s)
"${DEC[@]}" | docker exec -i "$db" pg_restore -U supabase_admin --dbname=postgres \
  --data-only --disable-triggers --no-owner --exit-on-error -L /tmp/restore-drill.toc
docker exec "$db" rm -f /tmp/restore-drill.toc
echo "restore-drill: restored in $(( $(date +%s) - start ))s. Row counts:"

docker exec -i "$db" psql -U postgres -At -F ' ' <<'SQL'
SELECT 'auth.users', count(*) FROM auth.users
UNION ALL SELECT 'auth.identities', count(*) FROM auth.identities
UNION ALL SELECT 'public.users', count(*) FROM public.users
UNION ALL SELECT 'public.courses', count(*) FROM public.courses
UNION ALL SELECT 'public.events', count(*) FROM public.events
UNION ALL SELECT 'public.calendar_sources', count(*) FROM public.calendar_sources
UNION ALL SELECT 'public.week_scores', count(*) FROM public.week_scores
UNION ALL SELECT 'public.notification_preferences', count(*) FROM public.notification_preferences
UNION ALL SELECT 'public.lecturer_allowlist', count(*) FROM public.lecturer_allowlist
UNION ALL SELECT 'public.sync_runs', count(*) FROM public.sync_runs
UNION ALL SELECT 'orphaned public.users (no account)', count(*)
  FROM public.users u LEFT JOIN auth.users a ON a.id = u.id WHERE a.id IS NULL
UNION ALL SELECT 'orphaned events (no course)', count(*)
  FROM public.events e LEFT JOIN public.courses c ON c.id = e.course_id WHERE c.id IS NULL;
SQL

echo
echo "restore-drill: compare these with production (Supabase → Table editor) and"
echo "restore-drill: record the result in the runbook. Both 'orphaned' counts must be 0."
echo "restore-drill: then wipe the restored data: bun run db:reset"
