/**
 * Nightly sync trigger — Trigger 3 in docs/adr/0001-sync-pipeline.md. Iterates
 * every calendar_sources row and calls runCalendarSync for each. One
 * student's feed failing must never block the rest of the batch, so each row
 * is caught individually and the loop continues.
 *
 * This is the HTTP endpoint the schedule hits — it does not itself set up
 * the schedule. The nightly cadence is Vercel Cron (see vercel.json), which
 * GETs this path and — since CRON_SECRET is set as a Vercel env var —
 * automatically attaches the same `Authorization: Bearer $CRON_SECRET`
 * header isAuthorized() checks for. Can also be triggered manually:
 *
 *   curl -X POST https://<host>/api/cron/sync -H "Authorization: Bearer $CRON_SECRET"
 *
 * Server-only: uses the service-role client directly, like calendar-sync.ts.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { runCalendarSync, type SyncResult } from "./calendar-sync";
import { isAuthorizedCronRequest, mapWithConcurrency } from "./cron-auth";
import { needsAttention, summariseRun, SYNC_RUN_RETENTION_DAYS, type RunSummary } from "./sync-run";
import { alertConfigFromEnv, buildAlertEmail, sendSyncAlert } from "./sync-alert";

type RowResult = {
  calendarSourceId: string;
  result: SyncResult | { status: "error"; message: string };
};

// Each sync is mostly waiting on Brightspace, so a few run side by side to
// keep the whole batch inside the function's time limit as students grow.
const SYNC_CONCURRENCY = 4;

export async function handleNightlySync(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env["CRON_SECRET"])) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const runId = await startRun();

  const { data: sources, error } = await supabaseAdmin.from("calendar_sources").select("id");
  if (error) {
    console.error(`[cron-sync] listing sources failed: ${error.message}`);
    await finishRun(
      runId,
      summariseRun([{ calendarSourceId: "(listing sources)", status: "error" }]),
      startedAt,
    );
    return new Response(JSON.stringify({ error: "Could not list calendar sources" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const results = await mapWithConcurrency(
    sources ?? [],
    SYNC_CONCURRENCY,
    async (source): Promise<RowResult> => {
      try {
        return { calendarSourceId: source.id, result: await runCalendarSync(source.id) };
      } catch (err) {
        // Logged and skipped — this row's failure must not stop the batch.
        console.error(`[cron-sync] ${source.id} threw:`, err);
        return {
          calendarSourceId: source.id,
          result: {
            status: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          },
        };
      }
    },
  );

  const summary = summariseRun(
    results.map((r) => ({ calendarSourceId: r.calendarSourceId, status: r.result.status })),
  );
  await finishRun(runId, summary, startedAt);

  return new Response(JSON.stringify({ summary, results }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// The run log must never stop or fail the sync itself, so these only log
// their own errors.

async function startRun(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("sync_runs").insert({}).select("id").single();
  if (error) {
    console.error(`[cron-sync] couldn't start the run log: ${error.message}`);
    return null;
  }
  return data.id;
}

async function finishRun(runId: string | null, summary: RunSummary, startedAt: number) {
  if (needsAttention(summary)) {
    // Always in Vercel's function logs; also emailed to the team once
    // RESEND_API_KEY and SYNC_ALERT_TO are set (CRU-27).
    console.error(
      `[cron-sync] ATTENTION: ${summary.failed} of ${summary.total} calendars failed to sync`,
      summary.failures,
    );
    const alertConfig = alertConfigFromEnv(process.env);
    if (alertConfig) await sendSyncAlert(alertConfig, buildAlertEmail(summary, runId, new Date()));
  }
  if (!runId) return;

  const { error } = await supabaseAdmin
    .from("sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      total: summary.total,
      ok: summary.ok,
      failed: summary.failed,
      failures: summary.failures,
      duration_ms: Date.now() - startedAt,
    })
    .eq("id", runId);
  if (error) console.error(`[cron-sync] couldn't complete the run log: ${error.message}`);

  const cutoff = new Date(Date.now() - SYNC_RUN_RETENTION_DAYS * 86_400_000).toISOString();
  const { error: pruneError } = await supabaseAdmin
    .from("sync_runs")
    .delete()
    .lt("started_at", cutoff);
  if (pruneError) console.error(`[cron-sync] couldn't prune old runs: ${pruneError.message}`);
}
