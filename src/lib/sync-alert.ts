/**
 * Emails the team when a nightly sync run has real failures (CRU-27 part 2).
 * Off until RESEND_API_KEY and SYNC_ALERT_TO are set in Vercel, so it can ship
 * before the email provider is chosen (CRU-33). Sending must never fail the
 * sync: every error is logged and swallowed.
 *
 * Contains only counts, calendar source ids and statuses: no student names,
 * emails or feed URLs.
 */
import type { RunSummary } from "./sync-run";

export type AlertConfig = { apiKey: string; to: string[]; from: string };

export function alertConfigFromEnv(env: Record<string, string | undefined>): AlertConfig | null {
  const apiKey = env["RESEND_API_KEY"];
  const to = (env["SYNC_ALERT_TO"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!apiKey || to.length === 0) return null;
  return { apiKey, to, from: env["SYNC_ALERT_FROM"] || "Crunch <alerts@resend.dev>" };
}

export function buildAlertEmail(summary: RunSummary, runId: string | null, when: Date) {
  const subject = `Crunch nightly sync: ${summary.failed} of ${summary.total} calendars failed`;
  const lines = [
    `The nightly sync on ${when.toISOString()} finished with failures.`,
    "",
    `Total: ${summary.total}   OK: ${summary.ok}   Failed: ${summary.failed}`,
    "",
    "Failures (calendar source id: status):",
    ...summary.failures.map((f) => `  ${f.calendarSourceId}: ${f.status}`),
    "",
    runId ? `sync_runs id: ${runId}` : "The run log couldn't be written for this run.",
    "What to do: docs/runbook.md → Checking the nightly sync.",
  ];
  return { subject, text: lines.join("\n") };
}

export async function sendSyncAlert(
  config: AlertConfig,
  email: { subject: string; text: string },
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: config.to,
        subject: email.subject,
        text: email.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`[sync-alert] provider returned ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[sync-alert] sending failed:", err);
    return false;
  }
}
