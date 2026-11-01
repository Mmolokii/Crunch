/**
 * Security headers for every response the server renders (CRU-29). Applied in
 * src/server.ts, the one place every non-static request passes through.
 *
 * Inline scripts are allowed only with this response's nonce (CRU-39).
 * server.ts makes a fresh nonce per request and the router stamps it on every
 * inline script TanStack Start renders (see src/router.tsx), so an injected
 * <script> without it is refused. style-src keeps 'unsafe-inline': React style
 * attributes and the chart component's <style> need it, and nonces can't cover
 * style attributes.
 */
import { randomBytes } from "node:crypto";

import { CSP_NONCE_HEADER } from "./csp-nonce";

export function createNonce(): string {
  return randomBytes(16).toString("base64");
}

function supabaseOrigin(): string | null {
  const raw = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(nonce: string): string {
  const supabase = supabaseOrigin();
  return [
    "default-src 'self'",
    // Vite's dev server injects its own inline scripts (React Refresh, HMR)
    // without our nonce, so local development keeps 'unsafe-inline'.
    process.env["NODE_ENV"] === "development"
      ? "script-src 'self' 'unsafe-inline'"
      : `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    ["connect-src 'self'", supabase].filter(Boolean).join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function securityHeaders(nonce: string): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(nonce),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

/** Returns the response with the security headers set (a copy, since fetch Responses can have immutable headers). */
export function withSecurityHeaders(response: Response, nonce: string): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders(nonce))) {
    secured.headers.set(name, value);
  }
  return secured;
}

/**
 * The request as handed to TanStack Start, carrying this request's nonce in place of any client-sent value.
 *
 * Built from the URL and explicit options rather than `new Request(request, …)`: in `bun run dev`
 * the incoming request is the dev server's own Request class, not the runtime's, and copying one
 * of those fails ("Cannot read private member #state"). Vercel hands over a native Request, so
 * production never hit it.
 */
export function withNonceHeader(request: Request, nonce: string): Request {
  const headers = new Headers(request.headers);
  headers.set(CSP_NONCE_HEADER, nonce);
  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== null;
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: request.redirect,
  };
  if (hasBody) {
    init.body = request.body;
    // Node requires this when the body is a stream.
    init.duplex = "half";
  }
  if (request.signal instanceof AbortSignal) init.signal = request.signal;
  return new Request(request.url, init);
}
