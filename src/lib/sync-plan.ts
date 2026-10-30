/**
 * Pure decisions the sync makes about rows (CRU-35), kept out of
 * calendar-sync.ts so they can be unit-tested without a database.
 */
import type { ClassifiedEvent } from "@/lib/ics-parser";

/** Identifies an event within one student's data: the same UID can appear in two courses. */
export const eventKey = (courseCode: string, uid: string) => `${courseCode}\u0000${uid}`;

/**
 * One row per (course, UID). A feed that repeats a UID would otherwise make
 * the bulk upsert fail ("ON CONFLICT DO UPDATE command cannot affect row a
 * second time"); the last occurrence wins, as it did with row-by-row writes.
 */
export function dedupeEvents(events: ClassifiedEvent[]): ClassifiedEvent[] {
  const byKey = new Map<string, ClassifiedEvent>();
  for (const event of events) byKey.set(eventKey(event.courseCode!, event.uid), event);
  return [...byKey.values()];
}

export type ExistingEvent = {
  id: string;
  courseCode: string;
  externalUid: string;
  source: string;
  actualHoursLogged: number | null;
  completedAt: string | null;
};

/**
 * Events that came from the feed, are no longer in it, and that the student
 * hasn't touched. Lecturer-added (manual) events are never removed, and
 * neither is anything with logged hours or marked complete: losing a
 * student's own record is worse than keeping a stale deadline.
 */
export function staleEventIds(existing: ExistingEvent[], inFeed: Set<string>): string[] {
  return existing
    .filter(
      (e) =>
        e.source === "ics_sync" &&
        !inFeed.has(eventKey(e.courseCode, e.externalUid)) &&
        e.actualHoursLogged === null &&
        e.completedAt === null,
    )
    .map((e) => e.id);
}
