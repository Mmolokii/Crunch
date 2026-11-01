import { describe, expect, mock, spyOn, test } from "bun:test";

import {
  heartbeatBody,
  heartbeatPingUrl,
  heartbeatUrlFromEnv,
  sendHeartbeat,
} from "./sync-heartbeat";
import { summariseRun } from "./sync-run";

describe("heartbeatUrlFromEnv", () => {
  test("is off until the URL is set", () => {
    expect(heartbeatUrlFromEnv({})).toBeNull();
    expect(heartbeatUrlFromEnv({ HEALTHCHECK_SYNC_URL: "  " })).toBeNull();
  });

  test("refuses anything that isn't a valid https URL", () => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    expect(heartbeatUrlFromEnv({ HEALTHCHECK_SYNC_URL: "http://hc-ping.com/abc" })).toBeNull();
    expect(heartbeatUrlFromEnv({ HEALTHCHECK_SYNC_URL: "not a url" })).toBeNull();
    quiet.mockRestore();
  });

  test("reads an https URL", () => {
    expect(heartbeatUrlFromEnv({ HEALTHCHECK_SYNC_URL: "https://hc-ping.com/abc" })?.href).toBe(
      "https://hc-ping.com/abc",
    );
  });
});

describe("heartbeatPingUrl", () => {
  const base = new URL("https://hc-ping.com/abc-123/");

  test("appends /start and /fail, and uses the plain URL for success", () => {
    expect(heartbeatPingUrl(base, "start")).toBe("https://hc-ping.com/abc-123/start");
    expect(heartbeatPingUrl(base, "success")).toBe("https://hc-ping.com/abc-123");
    expect(heartbeatPingUrl(base, "fail")).toBe("https://hc-ping.com/abc-123/fail");
  });
});

describe("heartbeatBody", () => {
  test("carries counts only, never calendar source ids", () => {
    const body = heartbeatBody(
      summariseRun([
        { calendarSourceId: "src-1", status: "ok" },
        { calendarSourceId: "src-2", status: "unreachable" },
      ]),
    );
    expect(body).toBe("total=2 ok=1 failed=1");
    expect(body).not.toContain("src-");
  });
});

describe("sendHeartbeat", () => {
  const base = new URL("https://hc-ping.com/abc");

  test("posts the body to the ping URL for that kind", async () => {
    const fetchMock = mock(async () => new Response("OK", { status: 200 }));
    expect(await sendHeartbeat(base, "fail", "total=1", fetchMock as unknown as typeof fetch)).toBe(
      true,
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hc-ping.com/abc/fail");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("total=1");
  });

  test("never throws: an error response or network failure just returns false", async () => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    const rejected = mock(async () => new Response("nope", { status: 404 }));
    expect(await sendHeartbeat(base, "start", "", rejected as unknown as typeof fetch)).toBe(false);
    const offline = mock(async () => {
      throw new Error("offline");
    });
    expect(await sendHeartbeat(base, "start", "", offline as unknown as typeof fetch)).toBe(false);
    expect(quiet).toHaveBeenCalledTimes(2);
    quiet.mockRestore();
  });
});
