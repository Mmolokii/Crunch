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

  const { data: sources, error } = await supabaseAdmin.from("calendar_sources").select("id");
  if (error) {
    console.error(`[cron-sync] listing sources failed: ${error.message}`);
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

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.result.status === "ok").length,
    failed: results
      .filter((r) => r.result.status !== "ok")
      .map((r) => ({
        calendarSourceId: r.calendarSourceId,
        status: r.result.status,
      })),
  };

  return new Response(JSON.stringify({ summary, results }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
