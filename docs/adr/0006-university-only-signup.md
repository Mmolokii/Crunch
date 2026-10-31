# ADR-0006: University-only sign-up is enforced by a Supabase Auth hook

**Status:** Accepted
**Date:** 2026-10-30
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane
**Issue:** CRU-25

_Recorded retroactively on 31 October 2026._

## Context

Crunch is for one university's students. The `@myemeris.edu.za` check used to happen only in the browser, so anyone calling Supabase's API directly could create an account (and trigger confirmation emails to any address).

## Decision

`hook_require_university_email` is configured as Supabase Auth's **Before User Created** hook. It refuses any address whose domain isn't exactly `myemeris.edu.za`, before an account exists or an email is sent. `complete_signup` repeats the check as a second layer. Only `supabase_auth_admin` can execute the hook.

## Consequences

- No outside accounts, and no emails sent on behalf of strangers.
- The hook must be enabled in the Supabase dashboard (Authentication → Hooks). A migration alone doesn't switch it on, so the go-live checklist covers it.
- A second institution would mean changing the hook (see CRU-44).

## Alternatives considered

- **Browser check only (the original):** trivially bypassed.
- **Check in `complete_signup` only:** the account and the email would already exist.
