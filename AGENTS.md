# Working in this repo

Crunch is a TanStack Start app on Supabase. A few conventions matter more here than in a typical project:

## Security model

- **Never trust the client for anything privileged.** Role, ownership, and cohort thresholds are enforced in Postgres, not in route components or server function handlers.
- All privileged reads/writes go through `src/lib/crunch.functions.ts` server functions, each behind the `requireSupabaseAuth` middleware (`src/integrations/supabase/auth-middleware.ts`), which verifies the caller's Supabase session server-side before any query runs.
- Anything that needs an ownership check beyond RLS (logging hours, lecturer due-date edits, cohort aggregation) is a `SECURITY DEFINER` Postgres function in `supabase/migrations/`, with the ownership check written into the function body — not assumed from the caller. Follow that pattern for new privileged writes rather than relying on RLS alone.
- `src/integrations/supabase/client.server.ts` exposes the service-role client, which bypasses RLS entirely. It's for trusted server-only operations (signup domain/role enforcement, the sync trigger). Never import it into a route file or anything that ships to the client bundle.

## Database changes

- Migrations in `supabase/migrations/` are additive only — no column drops, no constraint changes to existing unique constraints, each one reviewed before it ships. Ship RLS policy changes and explicit `GRANT`/`REVOKE` statements in the same migration as the schema change they support.

## Conventions

- Server functions validate input with Zod (`inputValidator`) — every one of them, no exceptions.
- Every route exports its own `head()` metadata (title, description, OG tags) — public and authenticated pages alike.
- `src/lib/workload.ts` is pure logic (scoring, grouping, formatting) with no I/O — keep it that way so it stays easy to test.

## Git

- Feature branches off `main`, merged via PR. Keep commits scoped to one area.
- `bun run lint` and `bun run build` should pass before opening a PR.
