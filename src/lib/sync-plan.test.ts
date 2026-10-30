import { describe, expect, test } from "bun:test";

import type { ClassifiedEvent } from "./ics-parser";
import { dedupeEvents, eventKey, staleEventIds, type ExistingEvent } from "./sync-plan";

function classified(uid: string, courseCode: string, title = uid): ClassifiedEvent {
  return {
    uid,
    title,
    courseCode,
    courseName: courseCode,
    type: "problem_set",
    dueAt: new Date(0),
    skip: false,
  };
}

function existing(overrides: Partial<ExistingEvent>): ExistingEvent {
  return {
    id: "e1",
    courseCode: "PROG6221",
    externalUid: "u1",
    source: "ics_sync",
    actualHoursLogged: null,
    completedAt: null,
    ...overrides,
  };
}

describe("dedupeEvents", () => {
  test("keeps one row per course and UID, the last one winning", () => {
    const out = dedupeEvents([
      classified("u1", "PROG6221", "first"),
      classified("u1", "PROG6221", "second"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe("second");
  });

  test("the same UID in two courses stays as two rows", () => {
    expect(dedupeEvents([classified("u1", "PROG6221"), classified("u1", "CLDV6212")])).toHaveLength(
      2,
    );
  });
});

describe("staleEventIds", () => {
  const inFeed = new Set([eventKey("PROG6221", "kept")]);

  test("removes a synced event that left the feed and was never touched", () => {
    expect(staleEventIds([existing({ id: "gone", externalUid: "gone" })], inFeed)).toEqual([
      "gone",
    ]);
  });

  test("keeps events still in the feed", () => {
    expect(staleEventIds([existing({ externalUid: "kept" })], inFeed)).toEqual([]);
  });

  test("never removes lecturer-added events", () => {
    expect(staleEventIds([existing({ externalUid: "gone", source: "manual" })], inFeed)).toEqual(
      [],
    );
  });

  test("never removes an event the student logged hours on or completed", () => {
    expect(
      staleEventIds(
        [
          existing({ id: "a", externalUid: "gone", actualHoursLogged: 0 }),
          existing({ id: "b", externalUid: "gone2", completedAt: "2026-10-01T00:00:00Z" }),
        ],
        inFeed,
      ),
    ).toEqual([]);
  });

  test("matches on course as well as UID", () => {
    expect(
      staleEventIds([existing({ id: "x", courseCode: "CLDV6212", externalUid: "kept" })], inFeed),
    ).toEqual(["x"]);
  });
});
