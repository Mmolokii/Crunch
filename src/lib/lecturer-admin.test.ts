import { describe, expect, test } from "bun:test";

import {
  isUniversityEmail,
  parseCourseCodes,
  parseLecturerArgs,
  planLink,
  summariseCourses,
} from "./lecturer-admin";

describe("isUniversityEmail", () => {
  test("accepts exactly one @ on the university domain", () => {
    expect(isUniversityEmail("a.lecturer@myemeris.edu.za")).toBe(true);
    expect(isUniversityEmail("a@gmail.com")).toBe(false);
    expect(isUniversityEmail("a@evil.myemeris.edu.za")).toBe(false);
    expect(isUniversityEmail("a@b@myemeris.edu.za")).toBe(false);
    expect(isUniversityEmail("@myemeris.edu.za")).toBe(false);
  });
});

describe("parseCourseCodes", () => {
  test("trims, drops blanks and de-duplicates case-insensitively", () => {
    expect(parseCourseCodes(" PROG6221, ,prog6221,XISD5319 ")).toEqual(["PROG6221", "XISD5319"]);
  });
});

describe("parseLecturerArgs", () => {
  test("add: lower-cases the email and reads courses, note and --yes", () => {
    expect(
      parseLecturerArgs([
        "add",
        "A.Lecturer@MyEmeris.edu.za",
        "--courses",
        "PROG6221",
        "--note",
        "IT, expires 31 Jan",
        "--yes",
      ]),
    ).toEqual({
      command: "add",
      email: "a.lecturer@myemeris.edu.za",
      courses: ["PROG6221"],
      note: "IT, expires 31 Jan",
      yes: true,
    });
  });

  test("add without --yes is a dry run, with no courses or note", () => {
    expect(parseLecturerArgs(["add", "l@myemeris.edu.za"])).toEqual({
      command: "add",
      email: "l@myemeris.edu.za",
      courses: [],
      note: null,
      yes: false,
    });
  });

  test("remove, list and courses", () => {
    expect(parseLecturerArgs(["remove", "l@myemeris.edu.za", "--yes"])).toEqual({
      command: "remove",
      email: "l@myemeris.edu.za",
      yes: true,
    });
    expect(parseLecturerArgs(["list"])).toEqual({ command: "list" });
    expect(parseLecturerArgs(["courses"])).toEqual({ command: "courses" });
  });

  test("refuses anything it doesn't understand", () => {
    expect(() => parseLecturerArgs([])).toThrow("Usage");
    expect(() => parseLecturerArgs(["promote", "l@myemeris.edu.za"])).toThrow("Usage");
    expect(() => parseLecturerArgs(["add", "l@gmail.com"])).toThrow("isn't an @myemeris.edu.za");
    expect(() => parseLecturerArgs(["add"])).toThrow("exactly one email");
    expect(() => parseLecturerArgs(["add", "l@myemeris.edu.za", "--courses"])).toThrow(
      "needs a value",
    );
    expect(() => parseLecturerArgs(["add", "l@myemeris.edu.za", "--force"])).toThrow(
      "Unknown option",
    );
    expect(() => parseLecturerArgs(["remove", "l@myemeris.edu.za", "--courses", "X"])).toThrow(
      "only takes --yes",
    );
    expect(() => parseLecturerArgs(["list", "extra"])).toThrow("no arguments");
  });
});

describe("planLink", () => {
  const me = "lecturer-1";
  const rows = [
    { id: "r1", code: "PROG6221", lecturer_id: null },
    { id: "r2", code: "PROG6221", lecturer_id: me },
    { id: "r3", code: "XISD5319", lecturer_id: "someone-else" },
    { id: "r4", code: "XISD5319", lecturer_id: null },
  ];

  test("links unclaimed rows, counts ones already linked, reports missing codes", () => {
    expect(planLink(["PROG6221", "NOPE101"], rows, me)).toEqual({
      toLink: ["r1"],
      alreadyLinked: 1,
      takenByOther: [],
      missing: ["NOPE101"],
    });
  });

  test("never overwrites another lecturer's link, but still flags the code", () => {
    const plan = planLink(["XISD5319"], rows, me);
    expect(plan.toLink).toEqual(["r4"]);
    expect(plan.takenByOther).toEqual(["XISD5319"]);
  });

  test("matches the code exactly", () => {
    expect(planLink(["prog6221"], rows, me).missing).toEqual(["prog6221"]);
  });
});

describe("summariseCourses", () => {
  test("one line per code with distinct students, busiest first", () => {
    expect(
      summariseCourses([
        { code: "A1", name: "Alpha", user_id: "s1", lecturer_id: null },
        { code: "B2", name: "Beta", user_id: "s1", lecturer_id: "l1" },
        { code: "B2", name: "Beta", user_id: "s2", lecturer_id: "l1" },
        { code: null, name: "No code", user_id: "s3", lecturer_id: null },
      ]),
    ).toEqual([
      { code: "B2", name: "Beta", students: 2, lecturerIds: ["l1"] },
      { code: "A1", name: "Alpha", students: 1, lecturerIds: [] },
    ]);
  });
});
