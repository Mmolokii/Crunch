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
import { isAllowedFeedUrl } from "@/lib/ics-url";
import { GENERIC_ERROR_MESSAGE, publicError } from "@/lib/server-errors";
import { dedupeEvents, eventKey, staleEventIds } from "@/lib/sync-plan";

export type SyncResult =
  | { status: "ok"; coursesTouched: number; eventsUpserted: number; eventsRemoved: number }
  | { status: "invalid_url" }
  | { status: "unreachable" }
  | { status: "empty" }
  /** Only from the user-triggered server functions, never from the sync itself. */
  | { status: "cooldown"; retryInSeconds: number };

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
// A real feed is tens of KB; anything near this is not a calendar.
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * MVP effort/stakes defaults per canonical type. Brightspace's feed carries
 * no effort estimate, so these are a starting point, not a measurement.
 * When a student logs the hours an item actually took, that number replaces
 * the estimate for that one item; these defaults themselves don't change
 * (see workload.ts / the "Log hours" flow).
 */
const TYPE_DEFAULTS: Record<CanonicalEventType, { estimatedHours: number; isHighStakes: boolean }> =
  {
    problem_set: { estimatedHours: 3, isHighStakes: false },
    essay: { estimatedHours: 5, isHighStakes: true },
    exam: { estimatedHours: 6, isHighStakes: true },
    quiz: { estimatedHours: 1, isHighStakes: false },
    reading: { estimatedHours: 2, isHighStakes: false },
    other: { estimatedHours: 1, isHighStakes: false },
  };

/**
 * Reads at most MAX_BODY_BYTES; returns null if the body is larger, so an
 * oversized response can't exhaust the function's memory.
 */
async function readCapped(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Redirects are followed by hand so every hop is re-checked against the
 * allow-list — fetch's own redirect handling would follow one anywhere.
 */
async function fetchIcs(url: string): Promise<{ ok: true; body: string } | { ok: false }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isAllowedFeedUrl(current)) return { ok: false };
      const response = await fetch(current, { signal: controller.signal, redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { ok: false };
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) return { ok: false };
      const body = await readCapped(response);
      return body === null ? { ok: false } : { ok: true, body };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Creates any of the student's courses that don't exist yet and returns the
 * id of every course in the feed, in one round trip. Backed by the
 * courses (user_id, code) unique constraint. Course names follow the feed.
 */
async function upsertCourses(
  userId: string,
  names: Map<string, string>,
): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("courses")
    .upsert(
      [...names].map(([code, name]) => ({ user_id: userId, code, name })),
      { onConflict: "user_id,code" },
    )
    .select("id, code");
  if (error) throw publicError(error, "upsertCourses");
  return new Map(data.map((c) => [c.code ?? "", c.id]));
}

export async function runCalendarSync(calendarSourceId: string): Promise<SyncResult> {
  const { data: source, error: sourceError } = await supabaseAdmin
    .from("calendar_sources")
    .select("id, user_id, ics_url_encrypted")
    .eq("id", calendarSourceId)
    .single();
  if (sourceError) throw publicError(sourceError, "runCalendarSync");
  if (!source.user_id) {
    console.error(`[runCalendarSync] calendar_sources ${calendarSourceId} has no user_id`);
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
  const userId = source.user_id;

  const url = decryptIcsUrl(source.ics_url_encrypted);
  // Re-checked here, not only on save: the stored value is not trusted.
  if (!isAllowedFeedUrl(url)) return { status: "invalid_url" };

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

  // An empty feed returns here, before anything is removed below: a feed that
  // briefly comes back empty must never wipe a student's calendar.
  if (classified.length === 0) return { status: "empty" };

  const events = dedupeEvents(classified);
  const courseNames = new Map(events.map((e) => [e.courseCode!, e.courseName ?? e.courseCode!]));
  const courseIdByCode = await upsertCourses(userId, courseNames);

  // One bulk upsert on events (course_id, external_uid). The payload
  // deliberately leaves out actual_hours_logged and completed_at, so a
  // re-sync can't undo a student's logged hours or completion (see the ADR),
  // and leaves out source, so new rows get the 'ics_sync' default and
  // existing rows keep theirs.
  const { error: upsertError } = await supabaseAdmin.from("events").upsert(
    events.map((event) => {
      const defaults = TYPE_DEFAULTS[event.type];
      return {
        course_id: courseIdByCode.get(event.courseCode!)!,
        external_uid: event.uid,
        title: event.title,
        due_at: event.dueAt.toISOString(),
        type: event.type,
        estimated_hours: defaults.estimatedHours,
        is_high_stakes: defaults.isHighStakes,
      };
    }),
    { onConflict: "course_id,external_uid" },
  );
  if (upsertError) throw publicError(upsertError, "runCalendarSync");

  const eventsRemoved = await removeStaleEvents(
    userId,
    new Set(events.map((e) => eventKey(e.courseCode!, e.uid))),
  );

  const { error: stampError } = await supabaseAdmin
    .from("calendar_sources")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", calendarSourceId);
  if (stampError) throw publicError(stampError, "runCalendarSync");

  return {
    status: "ok",
    coursesTouched: courseIdByCode.size,
    eventsUpserted: events.length,
    eventsRemoved,
  };
}

/** Deletes this student's synced events that have left the feed; see staleEventIds for what is kept. */
async function removeStaleEvents(userId: string, inFeed: Set<string>): Promise<number> {
  const { data: rows, error } = await supabaseAdmin
    .from("events")
    .select(
      "id, external_uid, source, actual_hours_logged, completed_at, courses!inner(code, user_id)",
    )
    .eq("courses.user_id", userId)
    .eq("source", "ics_sync");
  if (error) throw publicError(error, "removeStaleEvents");

  const stale = staleEventIds(
    rows.map((r) => ({
      id: r.id,
      courseCode: (r.courses as { code: string | null }).code ?? "",
      externalUid: r.external_uid,
      source: r.source,
      actualHoursLogged: r.actual_hours_logged === null ? null : Number(r.actual_hours_logged),
      completedAt: r.completed_at,
    })),
    inFeed,
  );
  // Batched: the ids travel in the query string, and a semester rollover can
  // retire hundreds at once.
  for (let i = 0; i < stale.length; i += 100) {
    const { error: deleteError } = await supabaseAdmin
      .from("events")
      .delete()
      .in("id", stale.slice(i, i + 100));
    if (deleteError) throw publicError(deleteError, "removeStaleEvents");
  }
  return stale.length;
}
