#!/usr/bin/env bash
# Encrypted backup of the production database (CRU-42). The project is on
# Supabase Free, which keeps no backups; use this before every production
# migration, weekly, and on launch day, until (or instead of) Supabase Pro.
#
# Needs:
#   pg_dump / pg_restore 17   brew install libpq && brew link --force libpq
#   openssl                   preinstalled on macOS
#   SUPABASE_DB_URL           Supabase → Connect → Session pooler URI, with the
#                             database password. Never commit it.
#   BACKUP_PASSPHRASE         long and random; keep it in a password manager.
#                             Without it a backup can't be restored.
#
# Usage:
#   SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... scripts/backup-db.sh
#   BACKUP_PASSPHRASE=... scripts/backup-db.sh --self-test   # checks encryption, no database
#
# Writes BACKUP_DIR (default ~/CrunchBackups, outside the repo) with
# owner-only permissions. The dump is encrypted before it touches disk, then
# decrypted and listed to prove it can be read back. Encrypted dumps older
# than 30 days are deleted: they hold students' personal information (POPIA).
set -euo pipefail

OUT_DIR="${BACKUP_DIR:-$HOME/CrunchBackups}"
RETENTION_DAYS=30
ENC=(openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE)

die() { echo "backup-db: $*" >&2; exit 1; }

[[ -n "${BACKUP_PASSPHRASE:-}" ]] || die "set BACKUP_PASSPHRASE"
[[ ${#BACKUP_PASSPHRASE} -ge 20 ]] || die "BACKUP_PASSPHRASE must be at least 20 characters"
command -v openssl >/dev/null || die "openssl not found"

umask 077
mkdir -p "$OUT_DIR"
case "$(cd "$OUT_DIR" && pwd -P)" in
  "$(git rev-parse --show-toplevel 2>/dev/null || echo /nonexistent)"*) die "BACKUP_DIR must be outside the repository" ;;
esac

if [[ "${1:-}" == "--self-test" ]]; then
  sample="$(head -c 4096 /dev/urandom | base64)"
  enc_file="$OUT_DIR/.self-test.enc"
  printf '%s' "$sample" | "${ENC[@]}" -out "$enc_file"
  roundtrip="$("${ENC[@]}" -d -in "$enc_file")"
  rm -f "$enc_file"
  [[ "$roundtrip" == "$sample" ]] || die "self-test FAILED: decrypted data differs"
  if BACKUP_PASSPHRASE="wrong-passphrase-wrong-passphrase" "${ENC[@]}" -d -in <(printf '%s' "$sample" | "${ENC[@]}") >/dev/null 2>&1; then
    die "self-test FAILED: a wrong passphrase decrypted the data"
  fi
  echo "backup-db: self-test passed (encrypt, decrypt, wrong passphrase refused) in $OUT_DIR"
  exit 0
fi

[[ -n "${SUPABASE_DB_URL:-}" ]] || die "set SUPABASE_DB_URL (Supabase → Connect → Session pooler)"
command -v pg_dump >/dev/null || die "pg_dump not found: brew install libpq && brew link --force libpq"
command -v pg_restore >/dev/null || die "pg_restore not found: brew install libpq && brew link --force libpq"

stamp="$(date -u +%Y%m%dT%H%MZ)"
file="$OUT_DIR/crunch-$stamp.dump.enc"

# public: the app's data. auth: accounts and identities. supabase_migrations:
# the migration history. Custom format so pg_restore can restore selectively.
pg_dump "$SUPABASE_DB_URL" \
  --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=supabase_migrations \
  | "${ENC[@]}" -out "$file"

# Prove it can be read back before trusting it.
"${ENC[@]}" -d -in "$file" | pg_restore --list >/dev/null \
  || { rm -f "$file"; die "verification FAILED: the dump could not be decrypted and read; nothing kept"; }

find "$OUT_DIR" -name 'crunch-*.dump.enc' -type f -mtime +"$RETENTION_DAYS" -delete

echo "backup-db: wrote $file ($(du -h "$file" | cut -f1)), verified readable"
echo "backup-db: encrypted dumps kept: $(find "$OUT_DIR" -name 'crunch-*.dump.enc' -type f | wc -l | tr -d ' ') (older than $RETENTION_DAYS days are deleted)"
