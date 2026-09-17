/**
 * Nightly sync trigger — Trigger 3 in docs/adr/0001-sync-pipeline.md. Iterates
 * every calendar_sources row and calls runCalendarSync for each. One
 * student's feed failing must never block the rest of the batch, so each row
 * is caught individually and the loop continues.
 *
 * This is the HTTP endpoint the schedule hits — it does not itself set up
 * the schedule. What actually calls this on a nightly cadence (Vercel Cron,
 * a GitHub Actions workflow, Supabase pg_cron, …) depends on the deploy
 * target, which CRU-19 hasn't decided yet. Until then, trigger it manually:
 *
 *   curl -X POST https://<host>/api/cron/sync -H "Authorization: Bearer $CRON_SECRET"
 *
 * Server-only: uses the service-role client directly, like calendar-sync.ts.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { runCalendarSync, type SyncResult } from "./calendar-sync";

type RowResult = { calendarSourceId: string; result: SyncResult | { status: "error"; message: string } };

function isAuthorized(request: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return false; // never allow this route to run wide open if unconfigured
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function handleNightlySync(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: sources, error } = await supabaseAdmin.from("calendar_sources").select("id");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const results: RowResult[] = [];
  for (const source of sources ?? []) {
    try {
      const result = await runCalendarSync(source.id);
      results.push({ calendarSourceId: source.id, result });
    } catch (err) {
      // Logged and skipped — this row's failure must not stop the batch.
      console.error(`[cron-sync] ${source.id} threw:`, err);
      results.push({
        calendarSourceId: source.id,
        result: { status: "error", message: err instanceof Error ? err.message : "Unknown error" },
      });
    }
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.result.status === "ok").length,
    failed: results.filter((r) => r.result.status !== "ok").map((r) => ({
      calendarSourceId: r.calendarSourceId,
      status: r.result.status,
    })),
  };

  return new Response(JSON.stringify({ summary, results }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
