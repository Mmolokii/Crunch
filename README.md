# Crunch

**See the heavy week before it lands.**

Crunch reads a student's university calendar feed, scores how heavy each upcoming week is going to be, and flags same-day high-stakes clashes across courses before they turn into a crisis. Lecturers get an anonymised, aggregate view of when their own cohort is under the most pressure, so a deadline can move before it collides with everything else.

Built as a HIVE-sponsored student innovation pilot by **Mmoloki Kgololosego** and **Tshiamo Aphane**.

## Why

Students don't usually find out a week is going to be brutal until they're in it — three deadlines from different courses landing on the same day, with no single place that shows the collision coming. Crunch turns a Brightspace calendar feed into a week-by-week workload score, so that collision is visible weeks in advance instead of the night before.

## How it works

- **Students** connect their Brightspace calendar subscription link once. Crunch estimates effort per assessment by type, groups everything into weeks, and scores each week Light through Brutal. After a deadline, a student can log the hours it actually took; that number replaces Crunch's estimate for that item in their week totals, and Insights shows where estimates ran high or low. Logged hours are private to the student and never shared across accounts.
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

Requires [Bun](https://bun.sh), Node.js 22+ (see `.nvmrc` — `@supabase/realtime-js` needs a native `WebSocket` global that older Node doesn't have; run `nvm use` in the repo root, or `nvm alias default 22` so every new shell picks it up automatically), and [Docker](https://www.docker.com/products/docker-desktop/) for the local database.

```sh
git clone https://github.com/Mmolokii/Crunch.git
cd Crunch
nvm use             # picks up Node 22 from .nvmrc
bun install
bun run db:start    # local Supabase from supabase/migrations, with fictional seed data
bun run db:env      # writes .env.local for it
bun run dev         # http://localhost:8080 — sign in as student01@myemeris.edu.za / crunch-local
```

No production access or secrets needed. The full walkthrough, seed accounts and troubleshooting are in [docs/guides/local-setup.md](docs/guides/local-setup.md). To run against a hosted Supabase project instead, copy `.env.example` to `.env` and fill it in.

### Environment variables

| Variable                                                     | Where it's used                                        | Notes                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL`                         | Server and client Supabase clients                     | Your Supabase project URL                                                                 |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Server and client Supabase clients                     | Anon/publishable key — safe to expose client-side                                         |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | Server-only admin client (`client.server.ts`)          | Bypasses RLS — never expose to the client, never commit                                   |
| `SUPABASE_PROJECT_ID`                                        | Local tooling                                          | —                                                                                         |
| `LECTURER_MIN_COHORT`                                        | Cohort heatmap threshold                               | Optional, defaults to 8                                                                   |
| `ICS_URL_ENCRYPTION_KEY`                                     | Calendar feed URL encryption (`lib/ics-encryption.ts`) | 32-byte hex key, server-only. Generate with `openssl rand -hex 32`                        |
| `CRON_SECRET`                                                | Nightly sync trigger (`POST /api/cron/sync`)           | Server-only. Generate with `openssl rand -hex 32`                                         |
| `ICS_ALLOWED_HOSTS`                                          | Feed URL allow-list (`lib/ics-url.ts`)                 | Comma-separated hosts the server may fetch feeds from; defaults to `mystudies.iie.edu.za` |
| `RESEND_API_KEY` / `SYNC_ALERT_TO` / `SYNC_ALERT_FROM`       | Nightly sync failure emails (`lib/sync-alert.ts`)      | Optional; alerts are off until the key and a recipient are set                            |

Database schema and RLS policies live entirely in `supabase/migrations/`. For a local database built from them (needs Docker), run `bun run db:start`; it prints a local URL and keys you can put in `.env`. See [CONTRIBUTING.md](CONTRIBUTING.md#database-changes).

### Scripts

```sh
bun run dev         # start the dev server
bun run build       # production build
bun run lint        # eslint
bun run test        # unit tests (bun test)
bun run typecheck   # tsc for app and tests; run after a build, which generates the route tree
bun run format      # prettier --write
bun run db:start    # local Supabase from supabase/migrations (Docker)
bun run db:env      # write .env.local for the local stack
bun run db:types    # regenerate src/integrations/supabase/types.ts from it
bun run db:reset    # rebuild the local database from scratch
bun run db:stop     # stop it
```

## Project status

This is a pilot MVP running in production at crunch-taupe.vercel.app. Students can connect their Brightspace calendar, get scored weeks, log hours, and download or delete their data; the calendar syncs nightly on Vercel Cron, with each run logged. Isolation between students is tested against production by `scripts/adversarial-test-matrix.ts`.

Still to do before inviting a full pilot cohort: production email (custom SMTP), backups, the POPIA retention policy and Information Officer, and checking the lecturer screens with a real lecturer account. Notification delivery isn't built yet, and the exam-period classifier hasn't seen real exam data. The pilot is launched from [docs/go-live-checklist.md](docs/go-live-checklist.md); open work is tracked in Linear.

## Contributing

Start with [docs/README.md](docs/README.md) for the architecture, data model and decision records. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch, review and merge flow, and [AGENTS.md](AGENTS.md) for code conventions and the security model. To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

All rights reserved. This is a private pilot project; no license is currently granted for reuse.
