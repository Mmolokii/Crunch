/**
 * The sync engine: fetch a student's Brightspace ICS feed, parse it, classify
 * each event, and upsert into courses/events. Called from three trigger
 * points (onboarding, settings "Sync now", and the nightly cron route) — see
 * docs/adr/0001-sync-pipeline.md. There is exactly one sync code path.
 *
 * Uses the service-role client directly, so this file must only ever be
 * imported from other server-only code (server functions, the cron route
 * handler) — never from a route file or anything shipped to the client bundle.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptIcsUrl } from "@/lib/ics-encryption";
import { classifyEvent, parseIcs, type CanonicalEventType } from "@/lib/ics-parser";

export type SyncResult =
  | { status: "ok"; coursesTouched: number; eventsUpserted: number }
  | { status: "invalid_url" }
  | { status: "unreachable" }
  | { status: "empty" };

const FETCH_TIMEOUT_MS = 15_000;

/**
 * MVP effort/stakes defaults per canonical type. Brightspace's feed carries
 * no effort estimate, so these are a starting point, not a measurement —
 * logging actual hours after the fact is what sharpens them per student
 * (see workload.ts / the "Log hours" flow).
 */
const TYPE_DEFAULTS: Record<CanonicalEventType, { estimatedHours: number; isHighStakes: boolean }> = {
  problem_set: { estimatedHours: 3, isHighStakes: false },
  essay: { estimatedHours: 5, isHighStakes: true },
  exam: { estimatedHours: 6, isHighStakes: true },
  quiz: { estimatedHours: 1, isHighStakes: false },
  reading: { estimatedHours: 2, isHighStakes: false },
  other: { estimatedHours: 1, isHighStakes: false },
};

async function fetchIcs(url: string): Promise<{ ok: true; body: string } | { ok: false }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { ok: false };
    return { ok: true, body: await response.text() };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Finds the student's existing course row by (user_id, code) or creates one.
 * No DB-level unique constraint backs this pair (consistent with how
 * lecturer_upsert_due_date does its own existence check rather than relying
 * on ON CONFLICT), so this is a manual check-then-write, same pattern.
 */
async function findOrCreateCourse(userId: string, code: string, name: string): Promise<string> {
  const { data: existing, error: findError } = await supabaseAdmin
    .from("courses")
    .select("id")
    .eq("user_id", userId)
    .eq("code", code)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) return existing.id;

  const { data: created, error: insertError } = await supabaseAdmin
    .from("courses")
    .insert({ user_id: userId, code, name })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  return created.id;
}

export async function runCalendarSync(calendarSourceId: string): Promise<SyncResult> {
  const { data: source, error: sourceError } = await supabaseAdmin
    .from("calendar_sources")
    .select("id, user_id, ics_url_encrypted")
    .eq("id", calendarSourceId)
    .single();
  if (sourceError) throw new Error(sourceError.message);

  const url = decryptIcsUrl(source.ics_url_encrypted);

  const fetched = await fetchIcs(url);
  if (!fetched.ok) return { status: "unreachable" };

  let rawEvents;
  try {
    rawEvents = parseIcs(fetched.body);
  } catch {
    return { status: "invalid_url" };
  }

  const classified = rawEvents
    .map(classifyEvent)
    .filter((e): e is NonNullable<typeof e> => e !== null && !e.skip && e.courseCode !== null);

  if (classified.length === 0) return { status: "empty" };

  const courseIdByCode = new Map<string, string>();
  let eventsUpserted = 0;

  for (const event of classified) {
    const code = event.courseCode!;
    let courseId = courseIdByCode.get(code);
    if (!courseId) {
      courseId = await findOrCreateCourse(source.user_id, code, event.courseName ?? code);
      courseIdByCode.set(code, courseId);
    }

    const defaults = TYPE_DEFAULTS[event.type];

    const { data: existingEvent, error: findEventError } = await supabaseAdmin
      .from("events")
      .select("id")
      .eq("course_id", courseId)
      .eq("external_uid", event.uid)
      .maybeSingle();
    if (findEventError) throw new Error(findEventError.message);

    if (existingEvent) {
      // Deliberately never touches actual_hours_logged / completed_at — both
      // are simply absent from this SET clause, so a re-sync can't silently
      // undo a student's logged hours or completion. See the ADR.
      const { error } = await supabaseAdmin
        .from("events")
        .update({
          title: event.title,
          due_at: event.dueAt.toISOString(),
          type: event.type,
          estimated_hours: defaults.estimatedHours,
          is_high_stakes: defaults.isHighStakes,
        })
        .eq("id", existingEvent.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("events").insert({
        course_id: courseId,
        external_uid: event.uid,
        title: event.title,
        due_at: event.dueAt.toISOString(),
        type: event.type,
        estimated_hours: defaults.estimatedHours,
        is_high_stakes: defaults.isHighStakes,
        source: "ics_sync",
      });
      if (error) throw new Error(error.message);
    }
    eventsUpserted += 1;
  }

  await supabaseAdmin
    .from("calendar_sources")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", calendarSourceId);

  return { status: "ok", coursesTouched: courseIdByCode.size, eventsUpserted };
}
