/**
 * One-off local test runner for runCalendarSync — NOT a server function, NOT
 * wired into the app. Delete once CRU-11 (real UI wiring + "Sync now") ships;
 * this exists purely to let us confirm the sync engine works against a real
 * Supabase project before wiring it into onboarding/settings.
 *
 * Usage:
 *   1. Make sure .env has SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 *      ICS_URL_ENCRYPTION_KEY set.
 *   2. Sign in to the app, go through onboarding (or settings, once it has a
 *      calendar field) and save your real Brightspace calendar URL — this
 *      creates an encrypted row in `calendar_sources` via the existing
 *      `saveCalendarSource` server function.
 *   3. Grab that row's `id` from the Supabase table editor (calendar_sources
 *      table) or by running:
 *        select id from calendar_sources where user_id = '<your auth uid>';
 *   4. Run:  bun run scripts/test-sync.ts <calendar_source_id>
 *
 * It prints the SyncResult and, on `ok`, dumps every course/event row it
 * touched so you can eyeball them against what your calendar actually shows
 * before trusting the classifier or wiring up UI.
 */
// Bun loads .env automatically — no dotenv package needed.
import { runCalendarSync } from "../src/lib/calendar-sync";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function main() {
  const calendarSourceId = process.argv[2];
  if (!calendarSourceId) {
    console.error("Usage: bun run scripts/test-sync.ts <calendar_source_id>");
    process.exit(1);
  }

  console.log(`Running sync for calendar_sources.id = ${calendarSourceId} ...`);
  const result = await runCalendarSync(calendarSourceId);
  console.log("\nResult:", result);

  if (result.status !== "ok") {
    console.log(
      "\nNot 'ok' — check the URL is a valid Brightspace feed link, reachable, and non-empty.",
    );
    return;
  }

  const { data: source } = await supabaseAdmin
    .from("calendar_sources")
    .select("user_id")
    .eq("id", calendarSourceId)
    .single();

  const { data: courses } = await supabaseAdmin
    .from("courses")
    .select("id, code, name")
    .eq("user_id", source?.user_id ?? "");
  console.log(`\n${courses?.length ?? 0} course(s):`);
  for (const c of courses ?? []) console.log(`  ${c.code ?? "(no code)"} — ${c.name}`);

  const courseIds = (courses ?? []).map((c) => c.id);
  const { data: events } = await supabaseAdmin
    .from("events")
    .select("title, type, due_at, estimated_hours, is_high_stakes, source, course_id")
    .in("course_id", courseIds)
    .order("due_at", { ascending: true });
  console.log(`\n${events?.length ?? 0} event(s):`);
  for (const e of events ?? []) {
    console.log(
      `  [${e.type}] ${e.title} — due ${e.due_at} — ${e.estimated_hours}h${e.is_high_stakes ? " (high-stakes)" : ""}`,
    );
  }
}

main()
  .catch((err) => {
    console.error("\nSync threw:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
