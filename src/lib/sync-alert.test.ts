import { describe, expect, mock, spyOn, test } from "bun:test";

import { alertConfigFromEnv, buildAlertEmail, sendSyncAlert } from "./sync-alert";
import { summariseRun } from "./sync-run";

describe("alertConfigFromEnv", () => {
  test("is off until both the key and a recipient are set", () => {
    expect(alertConfigFromEnv({})).toBeNull();
    expect(alertConfigFromEnv({ RESEND_API_KEY: "re_x" })).toBeNull();
    expect(alertConfigFromEnv({ SYNC_ALERT_TO: "a@x.co.za" })).toBeNull();
  });

  test("reads a comma-separated recipient list and a default sender", () => {
    expect(
      alertConfigFromEnv({ RESEND_API_KEY: "re_x", SYNC_ALERT_TO: " a@x.co.za, b@x.co.za " }),
    ).toEqual({
      apiKey: "re_x",
      to: ["a@x.co.za", "b@x.co.za"],
      from: "Crunch <alerts@resend.dev>",
    });
  });
});

describe("buildAlertEmail", () => {
  const summary = summariseRun([
    { calendarSourceId: "src-1", status: "ok" },
    { calendarSourceId: "src-2", status: "unreachable" },
  ]);

  test("says how many failed and lists each failing source with its status", () => {
    const { subject, text } = buildAlertEmail(summary, "run-9", new Date("2026-10-31T02:00:00Z"));
    expect(subject).toBe("Crunch nightly sync: 1 of 2 calendars failed");
    expect(text).toContain("src-2: unreachable");
    expect(text).toContain("sync_runs id: run-9");
    expect(text).not.toContain("src-1");
  });
});

describe("sendSyncAlert", () => {
  const config = { apiKey: "re_secret", to: ["team@x.co.za"], from: "Crunch <alerts@x.co.za>" };
  const email = { subject: "s", text: "t" };

  test("posts to Resend with the key as a bearer token", async () => {
    const fetchMock = mock(async () => new Response("{}", { status: 200 }));
    expect(await sendSyncAlert(config, email, fetchMock as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer re_secret");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Crunch <alerts@x.co.za>",
      to: ["team@x.co.za"],
      subject: "s",
      text: "t",
    });
  });

  test("never throws: a provider error or network failure just returns false", async () => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    const rejected = mock(async () => new Response("nope", { status: 422 }));
    expect(await sendSyncAlert(config, email, rejected as unknown as typeof fetch)).toBe(false);
    const offline = mock(async () => {
      throw new Error("offline");
    });
    expect(await sendSyncAlert(config, email, offline as unknown as typeof fetch)).toBe(false);
    expect(quiet).toHaveBeenCalledTimes(2);
    quiet.mockRestore();
  });
});
