# ADR-0009: A strict Content Security Policy with a per-request nonce

**Status:** Accepted
**Date:** 2026-10-30
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane
**Issues:** CRU-29, CRU-39

_Recorded retroactively on 31 October 2026._

## Context

A cross-site scripting bug in a page that shows students' data would be serious, and we had just patched one in TanStack Start itself (CRU-36). A policy that allows `'unsafe-inline'` scripts wouldn't stop an injected script.

## Decision

- `src/server.ts` creates a fresh random nonce for every request and hands it to the router in a request header (`x-crunch-csp-nonce`).
- The router stamps that nonce on every inline script TanStack Start renders (`src/router.tsx`).
- The policy allows scripts only from our origin or with that nonce. `connect-src` is limited to our origin and our Supabase project, and `frame-ancestors 'none'` prevents framing.
- Other headers on every response: `nosniff`, a strict referrer policy, and a permissions policy that switches off the camera, microphone, location, payment and USB.
- `style-src` keeps `'unsafe-inline'`, because React style attributes and the chart component need it and nonces can't cover style attributes.
- Local development keeps `'unsafe-inline'` for scripts, because Vite injects its own.

## Consequences

- An injected `<script>` won't run.
- Any third-party script or service (analytics, error tracking) needs a deliberate CSP change, which is a useful brake. The monitoring plan (CRU-49) relays Sentry through our own server for this reason.
- If TanStack Start changes how it renders inline scripts, the nonce wiring may need updating. The tests in `security-headers.test.ts` cover the policy.

## Alternatives considered

- **`'unsafe-inline'` scripts:** offers little protection against XSS.
- **Hash-based CSP:** the inline scripts change per page, so hashes would be fragile.
