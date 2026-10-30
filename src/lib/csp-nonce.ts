/**
 * Name of the request header src/server.ts uses to hand each request's CSP
 * nonce to the router (CRU-39). Kept in its own module because router.tsx is
 * also bundled for the browser, which must not pull in node:crypto.
 */
export const CSP_NONCE_HEADER = "x-crunch-csp-nonce";
