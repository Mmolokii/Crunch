import { describe, expect, test } from "bun:test";

import {
  belowMinCohort,
  courseOptionLabel,
  courseSearchSchema,
  selectCourse,
  type LecturerCourse,
} from "./lecturer-course";

const prog: LecturerCourse = {
  code: "PROG6221",
  name: "Programming 2B",
  studentCount: 10,
  courseId: "00000000-0000-0000-0000-000000000001",
};
const xisd: LecturerCourse = {
  code: "XISD5319",
  name: "Information Systems",
  studentCount: 6,
  courseId: "00000000-0000-0000-0000-000000000002",
};

describe("selectCourse", () => {
  test("picks the course named in the URL", () => {
    expect(selectCourse([prog, xisd], "XISD5319")).toBe(xisd);
  });

  test("no code, or one the lecturer isn't linked to → first course", () => {
    expect(selectCourse([prog, xisd], undefined)).toBe(prog);
    expect(selectCourse([prog, xisd], "COMP1000")).toBe(prog);
  });

  test("codes match exactly", () => {
    expect(selectCourse([prog, xisd], "xisd5319")).toBe(prog);
  });

  test("no courses linked → null", () => {
    expect(selectCourse([], "PROG6221")).toBeNull();
  });
});

describe("courseSearchSchema", () => {
  test("keeps a course code", () => {
    expect(courseSearchSchema.parse({ course: "XISD5319" })).toEqual({ course: "XISD5319" });
    expect(courseSearchSchema.parse({ course: " XISD5319 " })).toEqual({ course: "XISD5319" });
  });

  test("drops a missing, empty, oversized or non-string code instead of throwing", () => {
    expect(courseSearchSchema.parse({}).course).toBeUndefined();
    expect(courseSearchSchema.parse({ course: "" }).course).toBeUndefined();
    expect(courseSearchSchema.parse({ course: "x".repeat(65) }).course).toBeUndefined();
    expect(courseSearchSchema.parse({ course: 5319 }).course).toBeUndefined();
    expect(courseSearchSchema.parse({ course: ["a", "b"] }).course).toBeUndefined();
  });
});

describe("belowMinCohort", () => {
  test("the minimum itself is enough", () => {
    expect(belowMinCohort(xisd, 8)).toBe(true);
    expect(belowMinCohort({ ...xisd, studentCount: 8 }, 8)).toBe(false);
    expect(belowMinCohort(prog, 8)).toBe(false);
  });
});

describe("courseOptionLabel", () => {
  test("shows code, name and student count", () => {
    expect(courseOptionLabel(prog, 8)).toBe("PROG6221 · Programming 2B — 10 students");
    expect(courseOptionLabel({ ...prog, studentCount: 1 })).toBe(
      "PROG6221 · Programming 2B — 1 student",
    );
  });

  test("flags a cohort below the minimum", () => {
    expect(courseOptionLabel(xisd, 8)).toBe(
      "XISD5319 · Information Systems — 6 students (below 8)",
    );
    expect(courseOptionLabel(xisd)).toBe("XISD5319 · Information Systems — 6 students");
  });
});
