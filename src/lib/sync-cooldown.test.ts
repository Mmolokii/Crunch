import { describe, expect, test } from "bun:test";

import { cooldownSecondsLeft, SYNC_COOLDOWN_SECONDS } from "./sync-cooldown";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe("cooldownSecondsLeft", () => {
  test("never synced, or an unreadable timestamp → may sync now", () => {
    expect(cooldownSecondsLeft(null, NOW)).toBe(0);
    expect(cooldownSecondsLeft("not a date", NOW)).toBe(0);
  });

  test("counts down from the last successful sync", () => {
    expect(cooldownSecondsLeft(ago(0), NOW)).toBe(SYNC_COOLDOWN_SECONDS);
    expect(cooldownSecondsLeft(ago(30.5), NOW)).toBe(90);
    expect(cooldownSecondsLeft(ago(SYNC_COOLDOWN_SECONDS - 1), NOW)).toBe(1);
  });

  test("is over once the cooldown has passed", () => {
    expect(cooldownSecondsLeft(ago(SYNC_COOLDOWN_SECONDS), NOW)).toBe(0);
    expect(cooldownSecondsLeft(ago(86_400), NOW)).toBe(0);
  });

  test("a last sync in the future (clock skew) is treated as just now", () => {
    expect(cooldownSecondsLeft(ago(-60), NOW)).toBe(SYNC_COOLDOWN_SECONDS);
  });
});
