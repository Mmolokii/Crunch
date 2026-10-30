import { describe, expect, test } from "bun:test";

import { classifyEvent, parseIcs, type ParsedIcsEvent } from "./ics-parser";

const LOCATION = "Programming 2A PROG6221 2026 FT BCAD0701 EMGPMD Term1 GR01";

function feed(...events: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
}

function vevent(props: Record<string, string>): string {
  return ["BEGIN:VEVENT", ...Object.entries(props).map(([k, v]) => `${k}:${v}`), "END:VEVENT"].join(
    "\r\n",
  );
}

function parsed(overrides: Partial<ParsedIcsEvent>): ParsedIcsEvent {
  return {
    uid: "uid-1",
    summary: "Something - Due",
    description: "",
    location: LOCATION,
    dtstart: new Date("2026-09-17T21:59:00Z"),
    dtend: null,
    ...overrides,
  };
}

describe("parseIcs", () => {
  test("rejects a body that isn't an ICS feed", () => {
    expect(() => parseIcs("<html>Sign in</html>")).toThrow(/BEGIN:VCALENDAR/);
  });

  test("reads UID, SUMMARY, DESCRIPTION, LOCATION and UTC dates", () => {
    const [event] = parseIcs(
      feed(
        vevent({
          UID: "abc@d2l",
          SUMMARY: "POE Part 1 - Due",
          DESCRIPTION: "Assignments: POE Part 1",
          LOCATION,
          DTSTART: "20260917T215900Z",
          DTEND: "20260917T215900Z",
        }),
      ),
    );
    expect(event).toEqual({
      uid: "abc@d2l",
      summary: "POE Part 1 - Due",
      description: "Assignments: POE Part 1",
      location: LOCATION,
      dtstart: new Date("2026-09-17T21:59:00Z"),
      dtend: new Date("2026-09-17T21:59:00Z"),
    });
  });

  test("unfolds continuation lines and unescapes TEXT values", () => {
    const raw = feed(
      [
        "BEGIN:VEVENT",
        "UID:folded",
        "SUMMARY:Essay\\, part one\\; draft",
        "DESCRIPTION:Assignments: line one\\nline",
        "  two",
        "DTSTART:20260917T215900Z",
        "END:VEVENT",
      ].join("\r\n"),
    );
    const [event] = parseIcs(raw);
    expect(event?.summary).toBe("Essay, part one; draft");
    expect(event?.description).toBe("Assignments: line one\nline two");
  });

  test("ignores property parameters such as DTSTART;TZID=", () => {
    const [event] = parseIcs(
      feed(vevent({ UID: "tz", "DTSTART;VALUE=DATE": "20260917", SUMMARY: "x" })),
    );
    expect(event?.dtstart).toEqual(new Date("2026-09-17T00:00:00"));
  });

  test("drops events without a UID and keeps unparseable dates as null", () => {
    const events = parseIcs(
      feed(vevent({ SUMMARY: "no uid" }), vevent({ UID: "bad-date", DTSTART: "tomorrow" })),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.uid).toBe("bad-date");
    expect(events[0]?.dtstart).toBeNull();
  });
});

describe("classifyEvent", () => {
  test("takes the course code and name from LOCATION", () => {
    const result = classifyEvent(parsed({}));
    expect(result?.courseCode).toBe("PROG6221");
    expect(result?.courseName).toBe("Programming 2A");
  });

  test("has no course when LOCATION has no code", () => {
    const result = classifyEvent(parsed({ location: "Online" }));
    expect(result?.courseCode).toBeNull();
    expect(result?.courseName).toBeNull();
  });

  test("returns null when there is no start date", () => {
    expect(classifyEvent(parsed({ dtstart: null }))).toBeNull();
  });

  test("keeps only the Due marker of a quiz's three entries, with either dash", () => {
    const base = { description: "Quizzes: Quiz 3" };
    const due = classifyEvent(parsed({ ...base, summary: "Quiz 3 – Due" }));
    const available = classifyEvent(parsed({ ...base, summary: "Quiz 3 - Available" }));
    const ends = classifyEvent(parsed({ ...base, summary: "Quiz 3 – Availability Ends" }));

    expect(due).toMatchObject({ title: "Quiz 3", type: "quiz", skip: false });
    expect(available?.skip).toBe(true);
    expect(ends?.skip).toBe(true);
  });

  test("trusts the Brightspace category over the title", () => {
    const quiz = classifyEvent(
      parsed({ summary: "Essay check - Due", description: "Quizzes: Essay check" }),
    );
    const survey = classifyEvent(
      parsed({ summary: "Exam feedback - Due", description: "Surveys: Exam feedback" }),
    );
    expect(quiz?.type).toBe("quiz");
    expect(survey?.type).toBe("other");
  });

  test.each([
    ["Final Exam - Due", "exam"],
    ["Research Essay - Due", "essay"],
    ["Chapter 4 Reading - Due", "reading"],
    ["ICE Task 2 - Due", "problem_set"],
    ["POE Part 1 - Due", "problem_set"],
  ] as const)("assignment titled %p is classified as %p", (summary, type) => {
    const result = classifyEvent(parsed({ summary, description: "Assignments: x" }));
    expect(result?.type).toBe(type);
  });

  test("falls back to other with no category and no keyword", () => {
    expect(classifyEvent(parsed({ summary: "Guest lecture" }))?.type).toBe("other");
  });
});
