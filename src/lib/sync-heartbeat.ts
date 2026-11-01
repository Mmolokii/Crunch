/**
 * Heartbeat for the nightly sync (CRU-49 phase 1, closes CRU-27's "doesn't
 * run at all" gap). Each run pings a Healthchecks.io check: /start when it
 * begins, the plain URL when it finishes cleanly, /fail when it needs
 * attention. Healthchecks emails the team when a ping says fail, when a run
 * starts but never finishes, or when no ping arrives on schedule, so a night
 * the cron never fired is noticed too, which the run log alone can't do.
 *
 * Off until HEALTHCHECK_SYNC_URL is set. Pinging must never fail the sync:
 * every error is logged and swallowed. The body carries counts only: no
 * calendar source ids, student names, emails or feed URLs.
 */
import type { RunSummary } from "./sync-run";

export type HeartbeatKind = "start" | "success" | "fail";

export function heartbeatUrlFromEnv(env: Record<string, string | undefined>): URL | null {
  const raw = env["HEALTHCHECK_SYNC_URL"]?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      console.error("[sync-heartbeat] HEALTHCHECK_SYNC_URL must be https; heartbeat off");
      return null;
    }
    return url;
  } catch {
    console.error("[sync-heartbeat] HEALTHCHECK_SYNC_URL is not a valid URL; heartbeat off");
    return null;
  }
}

export function heartbeatPingUrl(base: URL, kind: HeartbeatKind): string {
  const path = base.pathname.replace(/\/+$/, "");
  const suffix = kind === "success" ? "" : `/${kind}`;
  return new URL(`${path}${suffix}`, base).toString();
}

export function heartbeatBody(summary: RunSummary): string {
  return `total=${summary.total} ok=${summary.ok} failed=${summary.failed}`;
}

export async function sendHeartbeat(
  base: URL,
  kind: HeartbeatKind,
  body = "",
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(heartbeatPingUrl(base, kind), {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`[sync-heartbeat] ${kind} ping returned ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[sync-heartbeat] ${kind} ping failed:`, err);
    return false;
  }
}
