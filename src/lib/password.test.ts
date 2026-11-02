import { describe, expect, test } from "bun:test";

import { MIN_PASSWORD_LENGTH, passwordProblem } from "./password";

describe("passwordProblem", () => {
  const ok = "x".repeat(MIN_PASSWORD_LENGTH);

  test("refuses anything shorter than the minimum", () => {
    expect(passwordProblem("x".repeat(MIN_PASSWORD_LENGTH - 1))).toContain("at least");
    expect(passwordProblem("")).toContain("at least");
  });

  test("accepts the minimum length", () => {
    expect(passwordProblem(ok)).toBeNull();
  });

  test("checks the repeated password when there is one", () => {
    expect(passwordProblem(ok, ok)).toBeNull();
    expect(passwordProblem(ok, `${ok}y`)).toContain("match");
  });
});
