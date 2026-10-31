# ADR-0004: Authorization is enforced in Postgres

**Status:** Accepted
**Date:** 2026-09-16
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane

_Recorded retroactively on 31 October 2026._

## Context

Crunch holds students' calendars and self-reported hours. A single forgotten check in application code must not be enough to expose another student's data.

## Decision

Four independent layers, numbered from the data outward:

1. **Row Level Security** on every table. Each policy compares `auth.uid()` with the row's owner.
2. **Least-privilege grants.** Students get `SELECT` on their own data, and writes only where they're meant to have them. Some tables have no grants for `anon` or `authenticated` at all.
3. **`SECURITY DEFINER` functions** for every privileged action, with the ownership check written into the function body and a fixed `search_path`.
4. **Function-level grants.** Each function is revoked from `PUBLIC` and `anon` and granted only to the role that needs it.

Server functions query as the signed-in user (through `requireSupabaseAuth`), so RLS applies. The service-role client, which bypasses RLS, is limited to the sync, the nightly run and account deletion.

## Consequences

- A bug in a page or server function can't return another student's rows.
- The rules are in SQL, so changes to them need careful review (`CODEOWNERS`) and a re-run of `scripts/adversarial-test-matrix.ts`, which checks 26 attacks against a real project.
- Some logic lives in plpgsql rather than TypeScript, so it's harder to unit test.

## Alternatives considered

- **Checks in server functions only:** one mistake exposes data, and every new function has to remember the rules.
- **A separate authorization service:** far too much for the scale.
