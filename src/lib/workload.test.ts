import { describe, expect, test } from "bun:test";

import {
  courseSplitOf,
  findConflicts,
  groupIntoWeeks,
  levelFor,
  weekLabelFor,
  weekStartOf,
  type AppEvent,
} from "./workload";

let nextId = 0;
function event(overrides: Partial<AppEvent>): AppEvent {
  nextId += 1;
  return {
    id: `e${nextId}`,
    title: "Task",
    courseCode: "PROG6221",
    courseName: "Programming 2A",
    type: "problem_set",
    dueAt: "2026-09-16T10:00:00Z",
    estimatedHours: 3,
    isHighStakes: false,
    actualHoursLogged: null,
    completed: false,
    source: "ics_sync",
    ...overrides,
  };
}

describe("levelFor", () => {
  test.each([
    [0, "Light"],
    [7.9, "Light"],
    [8, "Moderate"],
    [15.9, "Moderate"],
    [16, "Heavy"],
    [25.9, "Heavy"],
    [26, "Brutal"],
  ] as const)("%p hours is %p", (hours, level) => {
    expect(levelFor(hours)).toBe(level);
  });
});

describe("weekStartOf", () => {
  test("returns the Monday of the week, in UTC", () => {
    expect(weekStartOf(new Date("2026-09-14T00:00:00Z"))).toBe("2026-09-14"); // Monday
    expect(weekStartOf(new Date("2026-09-17T12:00:00Z"))).toBe("2026-09-14"); // Thursday
    expect(weekStartOf(new Date("2026-09-20T23:59:00Z"))).toBe("2026-09-14"); // Sunday
  });

  test("crosses month and year boundaries", () => {
    expect(weekStartOf(new Date("2027-01-01T08:00:00Z"))).toBe("2026-12-28");
  });
});

describe("weekLabelFor", () => {
  const today = new Date("2026-09-16T09:00:00Z");
  test("names this week, next week, and anything else", () => {
    expect(weekLabelFor("2026-09-14", today)).toBe("This week");
    expect(weekLabelFor("2026-09-21", today)).toBe("Next week");
    expect(weekLabelFor("2026-09-28", today)).toBe("Week of");
  });
});

describe("groupIntoWeeks", () => {
  test("buckets by Monday, sorts weeks and events, and scores the total", () => {
    const weeks = groupIntoWeeks(
      [
        event({ dueAt: "2026-09-24T10:00:00Z", estimatedHours: 2 }),
        event({ dueAt: "2026-09-18T10:00:00Z", estimatedHours: 6 }),
        event({ dueAt: "2026-09-15T10:00:00Z", estimatedHours: 5 }),
      ],
      new Date("2026-09-16T09:00:00Z"),
    );

    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-09-14", "2026-09-21"]);
    expect(weeks[0]?.events.map((e) => e.dueAt)).toEqual([
      "2026-09-15T10:00:00Z",
      "2026-09-18T10:00:00Z",
    ]);
    expect(weeks[0]).toMatchObject({ totalHours: 11, level: "Moderate", label: "This week" });
    expect(weeks[1]).toMatchObject({ totalHours: 2, level: "Light", label: "Next week" });
  });

  test("uses logged hours instead of the estimate once a student logs them", () => {
    const [week] = groupIntoWeeks([
      event({ estimatedHours: 3, actualHoursLogged: 10.25 }),
      event({ estimatedHours: 3 }),
    ]);
    expect(week?.totalHours).toBe(13.3);
  });

  test("returns nothing for no events", () => {
    expect(groupIntoWeeks([])).toEqual([]);
  });
});

describe("findConflicts", () => {
  test("flags two high-stakes deadlines from different courses on one day", () => {
    const conflicts = findConflicts([
      event({ isHighStakes: true, title: "Exam", courseCode: "PROG6221" }),
      event({
        isHighStakes: true,
        title: "Essay",
        courseCode: "CLDV6212",
        courseName: "Cloud Development",
      }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.note).toBe(
      "Programming 2A exam and Cloud Development essay fall on the same day.",
    );
  });

  test("ignores same-course pairs, low-stakes items and different days", () => {
    expect(
      findConflicts([
        event({ isHighStakes: true }),
        event({ isHighStakes: true }), // same course
        event({ isHighStakes: false, courseCode: "CLDV6212" }), // low stakes
        event({ isHighStakes: true, courseCode: "INSY6112", dueAt: "2026-09-17T10:00:00Z" }),
      ]),
    ).toEqual([]);
  });
});

describe("courseSplitOf", () => {
  test("totals hours per course and scales share to the heaviest course", () => {
    const split = courseSplitOf([
      event({ estimatedHours: 4 }),
      event({ estimatedHours: 4 }),
      event({ courseCode: "CLDV6212", courseName: "Cloud Development", estimatedHours: 2 }),
    ]);
    expect(split).toEqual([
      { code: "PROG6221", name: "Programming 2A", hours: 8, share: 100 },
      { code: "CLDV6212", name: "Cloud Development", hours: 2, share: 25 },
    ]);
  });
});
