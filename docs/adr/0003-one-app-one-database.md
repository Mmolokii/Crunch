# ADR-0003: One TanStack Start app on Vercel, one Supabase database

**Status:** Accepted
**Date:** 2026-09-16
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane
**Issue:** CRU-19

_Recorded retroactively on 31 October 2026._

## Context

Two students build and run Crunch alongside their studies, for a pilot of tens to low hundreds of students at one institution. Every extra service is another place for secrets to live, another thing to monitor, and another thing to hand over when we graduate.

## Decision

- **TanStack Start** (React 19, TypeScript) for both the pages and the server code. Server functions replace a separate API.
- **Vercel** hosts it: a preview for every pull request, production on every merge to `main`, and Vercel Cron for the nightly sync.
- **Supabase** provides Postgres, authentication and Row Level Security in one managed service.
- The calendar sync runs inside the same app ([ADR-0001](0001-sync-pipeline.md)).

## Consequences

- One codebase, one language, one deploy. A new contributor learns one stack.
- Access rules can live next to the data ([ADR-0004](0004-authorization-in-postgres.md)).
- We depend on two vendors' free or low tiers: Vercel's function time limits and Supabase's plan limits (no backups or log retention on Free; see CRU-42).
- TanStack Start is young. A security fix (CVE-2026-102989, CRU-36) had to be applied quickly, and some APIs (such as a route without a page) are thin, which is why `/api/cron/sync` is handled in `src/server.ts`.

## Alternatives considered

- **Separate backend service:** more moving parts with no scaling need at pilot size.
- **Next.js:** a reasonable choice. The project began on TanStack Start and there's been no reason to migrate.
- **Self-hosted Postgres:** we'd own backups, patching and auth ourselves.
