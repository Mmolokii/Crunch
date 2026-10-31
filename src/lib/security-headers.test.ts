import { afterEach, describe, expect, test } from "bun:test";

import { CSP_NONCE_HEADER } from "./csp-nonce";
import {
  contentSecurityPolicy,
  createNonce,
  withNonceHeader,
  withSecurityHeaders,
} from "./security-headers";

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
    expect(directives(contentSecurityPolicy("n0nce")).get("connect-src")).toBe(
      "'self' https://abc.supabase.co",
    );
  });

  test("falls back to VITE_SUPABASE_URL, and to 'self' alone without either", () => {
    delete process.env["SUPABASE_URL"];
    process.env["VITE_SUPABASE_URL"] = "https://xyz.supabase.co";
    expect(directives(contentSecurityPolicy("n0nce")).get("connect-src")).toBe(
      "'self' https://xyz.supabase.co",
    );
    delete process.env["VITE_SUPABASE_URL"];
    expect(directives(contentSecurityPolicy("n0nce")).get("connect-src")).toBe("'self'");
  });

  test("blocks framing, plugins, foreign scripts and <base> hijacking", () => {
    const d = directives(contentSecurityPolicy("n0nce"));
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("object-src")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("form-action")).toBe("'self'");
    expect(d.get("script-src")).toBe("'self' 'nonce-n0nce'");
  });
});

describe("withSecurityHeaders", () => {
  test("adds the headers and keeps status, body and existing headers", async () => {
    const original = new Response("<p>hi</p>", {
      status: 404,
      headers: { "content-type": "text/html" },
    });
    const secured = withSecurityHeaders(original, "n0nce");

    expect(secured.status).toBe(404);
    expect(await secured.text()).toBe("<p>hi</p>");
    expect(secured.headers.get("content-type")).toBe("text/html");
    expect(secured.headers.get("x-frame-options")).toBe("DENY");
    expect(secured.headers.get("x-content-type-options")).toBe("nosniff");
    expect(secured.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  test("works on a response whose headers are immutable", () => {
    const immutable = Response.redirect("https://example.com/", 302);
    expect(withSecurityHeaders(immutable, "n0nce").headers.get("location")).toBe(
      "https://example.com/",
    );
  });
});

describe("nonces", () => {
  test("inline scripts need this response's nonce; 'unsafe-inline' is gone from script-src", () => {
    const scriptSrc = directives(contentSecurityPolicy("abc123")).get("script-src")!;
    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  test("each nonce is fresh, 128-bit and base64", () => {
    const a = createNonce();
    expect(a).not.toBe(createNonce());
    expect(Buffer.from(a, "base64")).toHaveLength(16);
  });

  test("the router's nonce header always carries the server's value, not one the client sent", () => {
    const forged = new Request("https://crunch.test/", {
      headers: { [CSP_NONCE_HEADER]: "attacker" },
    });
    const handed = withNonceHeader(forged, "server-made");
    expect(handed.headers.get(CSP_NONCE_HEADER)).toBe("server-made");
    expect(handed.url).toBe("https://crunch.test/");
  });

  test("keeps the method and body of a POST", async () => {
    const post = new Request("https://crunch.test/_serverFn/x", {
      method: "POST",
      body: "payload",
    });
    const handed = withNonceHeader(post, "n");
    expect(handed.method).toBe("POST");
    expect(await handed.text()).toBe("payload");
  });

  test("accepts a request that isn't the runtime's own Request class (the dev server's)", async () => {
    // Mimics the dev server handing over its own Request implementation: the
    // right shape, but under Node `new Request(request)` can't copy it (Bun can,
    // so this checks the fix's behaviour rather than reproducing the throw).
    class ForeignRequest {
      #inner: Request;
      constructor(url: string, init?: RequestInit) {
        this.#inner = new Request(url, init);
      }
      get url() {
        return this.#inner.url;
      }
      get method() {
        return this.#inner.method;
      }
      get headers() {
        return this.#inner.headers;
      }
      get body() {
        return this.#inner.body;
      }
      get redirect() {
        return this.#inner.redirect;
      }
      get signal() {
        return this.#inner.signal;
      }
    }
    const foreign = new ForeignRequest("https://crunch.test/_serverFn/x", {
      method: "POST",
      headers: { "content-type": "application/json", [CSP_NONCE_HEADER]: "forged" },
      body: '{"a":1}',
    }) as unknown as Request;
    const handed = withNonceHeader(foreign, "server-made");
    expect(handed.headers.get(CSP_NONCE_HEADER)).toBe("server-made");
    expect(handed.headers.get("content-type")).toBe("application/json");
    expect(handed.method).toBe("POST");
    expect(await handed.text()).toBe('{"a":1}');
  });
});

describe("development", () => {
  test("keeps 'unsafe-inline' so Vite's own inline scripts run", () => {
    const original = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "development";
    try {
      expect(directives(contentSecurityPolicy("n")).get("script-src")).toBe(
        "'self' 'unsafe-inline'",
      );
    } finally {
      if (original === undefined) delete process.env["NODE_ENV"];
      else process.env["NODE_ENV"] = original;
    }
  });
});
