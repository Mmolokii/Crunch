/**
 * Per-student cooldown for the two user-triggered syncs (CRU-29). Each sync
 * makes an outbound fetch and many service-role writes, so a student can't
 * run them back to back. Measured from the last successful sync; failed
 * attempts never set last_synced_at, so a typo can be retried straight away.
 * The nightly cron isn't subject to it.
 */

export const SYNC_COOLDOWN_SECONDS = 120;

/** Seconds until the student may sync again, or 0 if they may sync now. */
export function cooldownSecondsLeft(lastSyncedAt: string | null, now = Date.now()): number {
  if (!lastSyncedAt) return 0;
  const last = Date.parse(lastSyncedAt);
  if (Number.isNaN(last)) return 0;
  const elapsed = (now - last) / 1000;
  if (elapsed < 0) return SYNC_COOLDOWN_SECONDS; // clock skew: treat as just synced
  return Math.max(0, Math.ceil(SYNC_COOLDOWN_SECONDS - elapsed));
}
