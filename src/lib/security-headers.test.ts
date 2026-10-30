import { afterEach, describe, expect, test } from "bun:test";

import { contentSecurityPolicy, withSecurityHeaders } from "./security-headers";

const saved = { url: process.env["SUPABASE_URL"], vite: process.env["VITE_SUPABASE_URL"] };

afterEach(() => {
  for (const [key, value] of [
    ["SUPABASE_URL", saved.url],
    ["VITE_SUPABASE_URL", saved.vite],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split("; ").map((d) => {
      const [name, ...rest] = d.split(" ");
      return [name!, rest.join(" ")];
    }),
  );
}

describe("contentSecurityPolicy", () => {
  test("allows fetches only to this app and the configured Supabase origin", () => {
    process.env["SUPABASE_URL"] = "https://abc.supabase.co/rest/v1";
    expect(directives(contentSecurityPolicy()).get("connect-src")).toBe(
      "'self' https://abc.supabase.co",
    );
  });

  test("falls back to VITE_SUPABASE_URL, and to 'self' alone without either", () => {
    delete process.env["SUPABASE_URL"];
    process.env["VITE_SUPABASE_URL"] = "https://xyz.supabase.co";
    expect(directives(contentSecurityPolicy()).get("connect-src")).toBe(
      "'self' https://xyz.supabase.co",
    );
    delete process.env["VITE_SUPABASE_URL"];
    expect(directives(contentSecurityPolicy()).get("connect-src")).toBe("'self'");
  });

  test("blocks framing, plugins, foreign scripts and <base> hijacking", () => {
    const d = directives(contentSecurityPolicy());
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("object-src")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("form-action")).toBe("'self'");
    expect(d.get("script-src")).toBe("'self' 'unsafe-inline'");
  });
});

describe("withSecurityHeaders", () => {
  test("adds the headers and keeps status, body and existing headers", async () => {
    const original = new Response("<p>hi</p>", {
      status: 404,
      headers: { "content-type": "text/html" },
    });
    const secured = withSecurityHeaders(original);

    expect(secured.status).toBe(404);
    expect(await secured.text()).toBe("<p>hi</p>");
    expect(secured.headers.get("content-type")).toBe("text/html");
    expect(secured.headers.get("x-frame-options")).toBe("DENY");
    expect(secured.headers.get("x-content-type-options")).toBe("nosniff");
    expect(secured.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  test("works on a response whose headers are immutable", () => {
    const immutable = Response.redirect("https://example.com/", 302);
    expect(withSecurityHeaders(immutable).headers.get("location")).toBe("https://example.com/");
  });
});
