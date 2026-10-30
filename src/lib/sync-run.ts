/**
 * Summarises one nightly sync run for the sync_runs log (CRU-27). Pure, so
 * it can be tested without a database.
 */

export type RunRow = { calendarSourceId: string; status: string };

export type RunSummary = {
  total: number;
  ok: number;
  failed: number;
  /** Every row that didn't sync cleanly, with its status. No student identity. */
  failures: RunRow[];
};

/** How long a run's history is kept. */
export const SYNC_RUN_RETENTION_DAYS = 90;

export function summariseRun(rows: RunRow[]): RunSummary {
  const failures = rows.filter((r) => r.status !== "ok");
  return {
    total: rows.length,
    ok: rows.length - failures.length,
    failed: failures.length,
    failures,
  };
}

/**
 * Whether a run should alert someone. "empty" (a feed with nothing due yet)
 * is normal between semesters, so only real failures count.
 */
export function needsAttention(summary: RunSummary): boolean {
  return summary.failures.some((f) => f.status !== "empty");
}
