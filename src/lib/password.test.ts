import { describe, expect, test } from "bun:test";

import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_CONFIRMATION_SECONDS,
  passwordConfirmedRecently,
  passwordProblem,
} from "./password";

describe("passwordConfirmedRecently", () => {
  const now = 1_800_000_000_000;
  const at = (secondsAgo: number) => now / 1000 - secondsAgo;

  test("accepts a password sign-in inside the window", () => {
    expect(passwordConfirmedRecently([{ method: "password", timestamp: at(10) }], now)).toBe(true);
    expect(
      passwordConfirmedRecently(
        [{ method: "password", timestamp: at(PASSWORD_CONFIRMATION_SECONDS) }],
        now,
      ),
    ).toBe(true);
  });

  test("refuses an old sign-in", () => {
    expect(
      passwordConfirmedRecently(
        [{ method: "password", timestamp: at(PASSWORD_CONFIRMATION_SECONDS + 1) }],
        now,
      ),
    ).toBe(false);
  });

  test("refuses other sign-in methods, however recent", () => {
    expect(passwordConfirmedRecently([{ method: "otp", timestamp: at(1) }], now)).toBe(false);
    expect(passwordConfirmedRecently([{ method: "recovery", timestamp: at(1) }], now)).toBe(false);
  });

  test("refuses a missing or malformed claim", () => {
    expect(passwordConfirmedRecently(undefined, now)).toBe(false);
    expect(passwordConfirmedRecently(["password"], now)).toBe(false);
    expect(passwordConfirmedRecently([{ method: "password" }], now)).toBe(false);
  });
});

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
