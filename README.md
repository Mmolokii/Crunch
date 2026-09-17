# Crunch

**See the heavy week before it lands.**

Crunch reads a student's university calendar feed, scores how heavy each upcoming week is going to be, and flags same-day high-stakes clashes across courses before they turn into a crisis. Lecturers get an anonymised, aggregate view of when their own cohort is under the most pressure, so a deadline can move before it collides with everything else.

Built as a HIVE-sponsored student innovation pilot by **Mmoloki Kgololosego** and **Tshiamo Aphane**.

## Why

Students don't usually find out a week is going to be brutal until they're in it — three deadlines from different courses landing on the same day, with no single place that shows the collision coming. Crunch turns a Brightspace calendar feed into a week-by-week workload score, so that collision is visible weeks in advance instead of the night before.

## How it works

- **Students** connect their Brightspace calendar subscription link once. Crunch estimates effort per assessment by type, groups everything into weeks, and scores each week Light through Brutal. Logging actual hours after a deadline passes sharpens future estimates for that student specifically — nothing is shared across accounts.
- **Lecturers** see cohort-level workload only: an aggregate heatmap of their own course, hidden entirely below a minimum cohort size, with no per-student drill-down. They can also set due dates directly, which are marked lecturer-set and survive every future calendar re-sync.
- Every screen is driven by live data with real empty and error states — there is no mock or placeholder data anywhere in the app.

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React 19, file-based routing, server functions)
- TypeScript
- [Supabase](https://supabase.com) (Postgres, Auth, Row Level Security)
- Tailwind CSS + [shadcn/ui](https://ui.shadcn.com) primitives
- Zod for input validation on every server function

## Project structure

```
src/
  routes/                  File-based routes (public pages + /_authenticated app)
  lib/
    crunch.functions.ts    Server functions — the only way the client talks to Supabase
    workload.ts            Pure scoring/grouping logic, no I/O
  integrations/supabase/   Supabase client setup (browser, server, admin) and auth middleware
  components/
    app/                   Authenticated app shell and workload UI
    site/                  Public site shell (header, footer, logo)
    ui/                    shadcn/ui primitives
supabase/
  migrations/               Additive SQL migrations — schema, RLS policies, SECURITY DEFINER functions
```

All privileged reads and writes go through server functions in `crunch.functions.ts`, each behind `requireSupabaseAuth` middleware that verifies the caller's Supabase session server-side. Nothing privileged is ever decided in the browser — role, ownership, and cohort thresholds are all enforced in Postgres via Row Level Security and `SECURITY DEFINER` functions with ownership checks baked in.

## Getting started

Requires [Bun](https://bun.sh), Node.js 22+ (see `.nvmrc` — `@supabase/realtime-js` needs a native `WebSocket` global that older Node doesn't have; run `nvm use` in the repo root, or `nvm alias default 22` so every new shell picks it up automatically), and a Supabase project.

```sh
git clone https://github.com/Mmolokii/Crunch.git
cd Crunch
nvm use             # picks up Node 22 from .nvmrc
bun install
cp .env.example .env   # fill in your Supabase project values
bun run dev
```

### Environment variables

| Variable                                                     | Where it's used                                        | Notes                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------ |
| `SUPABASE_URL` / `VITE_SUPABASE_URL`                         | Server and client Supabase clients                     | Your Supabase project URL                                          |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Server and client Supabase clients                     | Anon/publishable key — safe to expose client-side                  |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | Server-only admin client (`client.server.ts`)          | Bypasses RLS — never expose to the client, never commit            |
| `SUPABASE_PROJECT_ID`                                        | Local tooling                                          | —                                                                  |
| `LECTURER_MIN_COHORT`                                        | Cohort heatmap threshold                               | Optional, defaults to 8                                            |
| `ICS_URL_ENCRYPTION_KEY`                                     | Calendar feed URL encryption (`lib/ics-encryption.ts`) | 32-byte hex key, server-only. Generate with `openssl rand -hex 32` |
| `CRON_SECRET`                                                | Nightly sync trigger (`POST /api/cron/sync`)           | Server-only. Generate with `openssl rand -hex 32`                  |

Database schema and RLS policies live entirely in `supabase/migrations/` — apply them against your Supabase project with the Supabase CLI before running the app.

### Scripts

```sh
bun run dev         # start the dev server
bun run build       # production build
bun run lint        # eslint
bun run format      # prettier --write
```

## Project status

This is an active pilot MVP. Auth, the database schema, the core student and lecturer app screens, and the Brightspace calendar sync engine are all built against live Supabase data — students can connect a real calendar feed and get real scored weeks end to end. Remaining before pilot: the nightly sync trigger needs an actual schedule wired to it (depends on picking a deploy target), and the sync pipeline hasn't yet been tested against a second real account or exam-period data. See open issues for details.

## Contributing

Feature work happens on short-lived branches off `main`, merged via pull request. Keep commits scoped and the branch buildable — `bun run lint` and `bun run build` should pass before opening a PR.

## License

All rights reserved. This is a private pilot project; no license is currently granted for reuse.
