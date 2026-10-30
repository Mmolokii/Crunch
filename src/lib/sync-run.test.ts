import { describe, expect, test } from "bun:test";

import { needsAttention, summariseRun } from "./sync-run";

describe("summariseRun", () => {
  test("counts ok and failed rows and lists only the failures", () => {
    const summary = summariseRun([
      { calendarSourceId: "a", status: "ok" },
      { calendarSourceId: "b", status: "unreachable" },
      { calendarSourceId: "c", status: "ok" },
      { calendarSourceId: "d", status: "error" },
    ]);
    expect(summary).toEqual({
      total: 4,
      ok: 2,
      failed: 2,
      failures: [
        { calendarSourceId: "b", status: "unreachable" },
        { calendarSourceId: "d", status: "error" },
      ],
    });
  });

  test("an empty run is all zeros", () => {
    expect(summariseRun([])).toEqual({ total: 0, ok: 0, failed: 0, failures: [] });
  });
});

describe("needsAttention", () => {
  test("a clean run doesn't", () => {
    expect(needsAttention(summariseRun([{ calendarSourceId: "a", status: "ok" }]))).toBe(false);
  });

  test("a feed with nothing due yet doesn't", () => {
    expect(needsAttention(summariseRun([{ calendarSourceId: "a", status: "empty" }]))).toBe(false);
  });

  test.each(["unreachable", "invalid_url", "error"])("a %s row does", (status) => {
    expect(
      needsAttention(
        summariseRun([
          { calendarSourceId: "a", status: "ok" },
          { calendarSourceId: "b", status },
        ]),
      ),
    ).toBe(true);
  });
});
