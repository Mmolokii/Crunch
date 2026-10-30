import { afterEach, describe, expect, test } from "bun:test";

import { isAllowedFeedUrl } from "./ics-url";

const FEED = "https://mystudies.iie.edu.za/d2l/le/calendar/feed/user/feed.ics?token=abc";
const original = process.env["ICS_ALLOWED_HOSTS"];

afterEach(() => {
  if (original === undefined) delete process.env["ICS_ALLOWED_HOSTS"];
  else process.env["ICS_ALLOWED_HOSTS"] = original;
});

describe("isAllowedFeedUrl with the default host", () => {
  test.each([undefined, ""])("ICS_ALLOWED_HOSTS=%p falls back to the default", (value) => {
    if (value === undefined) delete process.env["ICS_ALLOWED_HOSTS"];
    else process.env["ICS_ALLOWED_HOSTS"] = value;
    expect(isAllowedFeedUrl(FEED)).toBe(true);
  });

  test.each([
    ["host in any letter case", FEED.replace("mystudies", "MYSTUDIES"), true],
    ["http", FEED.replace("https:", "http:"), false],
    ["a non-default port", FEED.replace(".za/", ".za:8443/"), false],
    ["credentials in the URL", FEED.replace("https://", "https://a:b@"), false],
    ["a look-alike suffix host", FEED.replace(".za/", ".za.evil.com/"), false],
    ["another host", "https://brightspace.myemeris.edu.za/d2l/le/calendar/feed/x", false],
    ["a non-feed path", "https://mystudies.iie.edu.za/d2l/home", false],
    ["an internal address", "https://169.254.169.254/d2l/le/calendar/feed/x", false],
    ["not a URL", "mystudies.iie.edu.za/d2l/le/calendar/feed/x", false],
  ] as const)("%s → %p", (_label, url, allowed) => {
    delete process.env["ICS_ALLOWED_HOSTS"];
    expect(isAllowedFeedUrl(url)).toBe(allowed);
  });
});

describe("isAllowedFeedUrl with ICS_ALLOWED_HOSTS set", () => {
  test("accepts any listed host and only those", () => {
    process.env["ICS_ALLOWED_HOSTS"] = " a.example.edu , b.example.edu";
    expect(isAllowedFeedUrl("https://b.example.edu/d2l/le/calendar/feed/x")).toBe(true);
    expect(isAllowedFeedUrl(FEED)).toBe(false);
  });

  test("a *. entry matches subdomains but not the bare domain", () => {
    process.env["ICS_ALLOWED_HOSTS"] = "*.iie.edu.za";
    expect(isAllowedFeedUrl(FEED)).toBe(true);
    expect(isAllowedFeedUrl("https://iie.edu.za/d2l/le/calendar/feed/x")).toBe(false);
    expect(isAllowedFeedUrl("https://eviliie.edu.za/d2l/le/calendar/feed/x")).toBe(false);
  });
});
