import { describe, expect, test } from "bun:test";

import { isAuthorizedCronRequest, mapWithConcurrency } from "./cron-auth";

describe("isAuthorizedCronRequest", () => {
  const secret = "s3cret-value";

  test("accepts the exact bearer token", () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true);
  });

  test.each([
    ["no header", null],
    ["empty header", ""],
    ["wrong secret", "Bearer nope"],
    ["missing scheme", secret],
    ["prefix of the secret", `Bearer ${secret.slice(0, 5)}`],
    ["secret plus extra", `Bearer ${secret}x`],
  ])("rejects %s", (_label, header) => {
    expect(isAuthorizedCronRequest(header, secret)).toBe(false);
  });

  test("refuses everything when no secret is configured", () => {
    expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
  });
});

describe("mapWithConcurrency", () => {
  test("keeps input order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([30, 5, 20, 1, 10], 2, async (ms) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return ms * 2;
    });
    expect(out).toEqual([60, 10, 40, 2, 20]);
    expect(peak).toBe(2);
  });

  test("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
