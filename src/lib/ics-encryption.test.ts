import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";

import { decryptIcsUrl, encryptIcsUrl } from "./ics-encryption";

const URL = "https://mystudies.iie.edu.za/d2l/le/calendar/feed/user/feed.ics?token=secret";
const original = process.env["ICS_URL_ENCRYPTION_KEY"];

beforeEach(() => {
  process.env["ICS_URL_ENCRYPTION_KEY"] = randomBytes(32).toString("hex");
});

afterEach(() => {
  if (original === undefined) delete process.env["ICS_URL_ENCRYPTION_KEY"];
  else process.env["ICS_URL_ENCRYPTION_KEY"] = original;
});

describe("encryptIcsUrl / decryptIcsUrl", () => {
  test("round-trips, stored as iv:tag:ciphertext without the plaintext", () => {
    const stored = encryptIcsUrl(URL);
    expect(stored.split(":")).toHaveLength(3);
    expect(stored).not.toContain("token");
    expect(decryptIcsUrl(stored)).toBe(URL);
  });

  test("uses a fresh IV every time", () => {
    expect(encryptIcsUrl(URL)).not.toBe(encryptIcsUrl(URL));
  });

  test("a tampered ciphertext doesn't decrypt to a usable URL", () => {
    const [iv, tag, data] = encryptIcsUrl(URL).split(":");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    const tampered = `${iv}:${tag}:${flipped.toString("base64")}`;
    expect(decryptIcsUrl(tampered)).toBe("");
  });

  test("a different key doesn't decrypt it", () => {
    const stored = encryptIcsUrl(URL);
    process.env["ICS_URL_ENCRYPTION_KEY"] = randomBytes(32).toString("hex");
    expect(decryptIcsUrl(stored)).toBe("");
  });

  test("an unencrypted value is never trusted as a URL", () => {
    expect(decryptIcsUrl(URL)).toBe("");
    expect(decryptIcsUrl("https://mystudies.iie.edu.za:443/x")).toBe("");
  });

  test("refuses to encrypt without a valid 32-byte key", () => {
    delete process.env["ICS_URL_ENCRYPTION_KEY"];
    expect(() => encryptIcsUrl(URL)).toThrow(/Missing ICS_URL_ENCRYPTION_KEY/);
    process.env["ICS_URL_ENCRYPTION_KEY"] = "abcd";
    expect(() => encryptIcsUrl(URL)).toThrow(/32-byte/);
  });
});
