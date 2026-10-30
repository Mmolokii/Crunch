import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { GENERIC_ERROR_MESSAGE, publicError } from "./server-errors";

const logged = spyOn(console, "error").mockImplementation(() => {});
afterEach(() => logged.mockClear());

describe("publicError", () => {
  test("passes through messages our own database functions raise for users", () => {
    const err = publicError(
      { code: "P0001", message: "Hours must be between 0 and 200" },
      "logActualHours",
    );
    expect(err.message).toBe("Hours must be between 0 and 200");
    expect(logged).not.toHaveBeenCalled();
  });

  test("hides schema details from anything else, and logs them server-side", () => {
    const raw =
      'duplicate key value violates unique constraint "events_course_id_external_uid_key"';
    const err = publicError({ code: "23505", message: raw }, "runCalendarSync");
    expect(err.message).toBe(GENERIC_ERROR_MESSAGE);
    expect(err.message).not.toContain("events");
    expect(logged).toHaveBeenCalledWith(`[runCalendarSync] 23505: ${raw}`);
  });

  test("treats a missing code as internal", () => {
    expect(publicError({ message: 'relation "x" does not exist' }, "f").message).toBe(
      GENERIC_ERROR_MESSAGE,
    );
    expect(
      publicError({ code: null, message: "permission denied for table users" }, "f").message,
    ).toBe(GENERIC_ERROR_MESSAGE);
  });
});
