/**
 * Security headers for every response the server renders (CRU-29). Applied in
 * src/server.ts, the one place every non-static request passes through.
 *
 * script-src keeps 'unsafe-inline' because TanStack Start's SSR streams inline
 * hydration scripts and this version has no nonce support wired up. The policy
 * still blocks scripts from any other origin, framing, plugins, <base> hijacking
 * and form posts or fetches to anywhere but this app and its Supabase project.
 */

function supabaseOrigin(): string | null {
  const raw = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(): string {
  const supabase = supabaseOrigin();
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
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

export function securityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

/** Returns the response with the security headers set (a copy, since fetch Responses can have immutable headers). */
export function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders())) {
    secured.headers.set(name, value);
  }
  return secured;
}
