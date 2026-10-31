# ADR-0010: Email confirmation waits for a button press

**Status:** Accepted (live once production email is configured, CRU-33)
**Date:** 2026-10-30
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane
**Issue:** CRU-33

## Context

University inboxes run on Microsoft 365, whose Safe Links scanner opens every link in an email before the student does. Supabase's default confirmation link is a one-time URL that verifies on load, so the scanner can use it up and the student sees "link expired".

## Decision

- The "Confirm signup" email template links to `/auth/confirm?token_hash=…&type=email` instead of Supabase's verify URL.
- The `/auth/confirm` page (`src/routes/auth_.confirm.tsx`) does nothing on load. It calls `verifyOtp` only when the student presses **Confirm my email**, then runs `complete_signup`.
- The page is `noindex`, and an expired or used link explains what to do next.

## Consequences

- Links survive scanners and email previews.
- Confirmation takes one extra tap.
- The template change happens in the Supabase dashboard together with custom SMTP (CRU-33). Until then, the default flow is still in use.

## Alternatives considered

- **Default Supabase links:** broken for many university inboxes.
- **Magic links or OTP codes only:** the same scanner problem, or more friction.
