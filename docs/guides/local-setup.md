# Local setup

**Owner:** Mmoloki Kgololosego · **Last reviewed:** 31 October 2026

Run Crunch on your own machine against a local database full of fictional students. You don't need access to production, any secrets, or a Supabase account. It takes about 15 minutes the first time (mostly downloads) and under a minute after that.

## You need

| Tool               | Why                                       | Check            |
| ------------------ | ----------------------------------------- | ---------------- |
| **Git**            | to clone the repo                         | `git --version`  |
| **Bun**            | installs packages, runs scripts and tests | `bun --version`  |
| **Node.js 22+**    | the dev server runs on it (`.nvmrc`)      | `node --version` |
| **Docker Desktop** | runs the local Supabase stack             | `docker info`    |

Docker needs to be running (the whale icon), with about 4 GB of free disk space for the images.

## First run

```sh
git clone https://github.com/Mmolokii/Crunch.git
cd Crunch
nvm use                # Node 22 from .nvmrc
bun install
bun run db:start       # local Supabase built from supabase/migrations, plus seed data
bun run db:env         # writes .env.local pointing the app at it
bun run dev            # http://localhost:8080
```

`db:start` downloads the Supabase images the first time, so give it a few minutes. When it finishes it prints local URLs and keys. You don't need to copy them: `db:env` does that.

## Sign in

Every seed account uses the password **`crunch-local`**:

| Email                                     | What you'll see                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `student01@myemeris.edu.za`               | A full semester: four courses, a Heavy week and a Brutal week, two clashes, logged hours in Insights |
| `student02` … `student10@myemeris.edu.za` | Fewer courses each; together they form the cohorts                                                   |
| `lecturer@myemeris.edu.za`                | The cohort heatmap for PROG6221 (10 students)                                                        |
| `newstudent@myemeris.edu.za`              | A brand-new account: first sign-in creates it, then an empty dashboard                               |

Due dates are relative to the current week, so there's always something upcoming. The data is in [`supabase/seed.sql`](../../supabase/seed.sql). Change it freely, then `bun run db:reset`.

You can also create accounts on the sign-up tab. Only `@myemeris.edu.za` addresses are accepted (the same Auth hook as production), and there's no confirmation email locally.

## Everyday commands

| Command            | Does                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| `bun run db:start` | Starts the local stack (keeps your data between runs)                               |
| `bun run db:stop`  | Stops it                                                                            |
| `bun run db:reset` | Rebuilds the database from the migrations and the seed. Your local changes are lost |
| `bun run db:types` | Regenerates `src/integrations/supabase/types.ts` after a migration                  |
| `bun run db:env`   | Rewrites `.env.local` (run again if `db:start` printed different keys)              |
| `bun run dev`      | The app, with hot reload                                                            |
| `bun run test`     | Unit tests                                                                          |

The local database is at `postgresql://postgres:postgres@127.0.0.1:54322/postgres` if you want to look at it with `psql` or a database client.

## What doesn't work locally

- **Connecting a calendar.** Onboarding only accepts feeds from the university's Brightspace host, and there's no real feed to fetch. The seed data stands in for synced calendars. To work on the sync itself, use the parser tests (`src/lib/ics-parser.test.ts`) with sample feeds.
- **Emails.** There's no mail server running, so confirmation and alert emails aren't sent. Accounts work without confirming.
- **The nightly cron.** Vercel runs it in production. Locally you can call it by hand: `curl -X POST http://localhost:8080/api/cron/sync -H "Authorization: Bearer $CRON_SECRET"`, with the value from `.env.local`.

## If you also have production values

If your `.env` has values for the hosted project, `.env.local` takes priority while it exists (Bun loads it first). Delete `.env.local` to point the app back at `.env`.

## Troubleshooting

| Problem                                            | Fix                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `db:start`: "Cannot connect to the Docker daemon"  | Start Docker Desktop and wait for it to say it's running                                                              |
| `db:env`: "The local Supabase stack isn't running" | Run `bun run db:start` first                                                                                          |
| Sign-in says "Invalid login credentials"           | Check the password is `crunch-local`. If you changed the seed, `bun run db:reset`                                     |
| Port 54321/54322 or 8080 already in use            | Another project's Supabase or dev server is running. `bunx supabase@2.120.0 stop --all`, or stop the other dev server |
| Every page is a 500 in `bun run dev`               | Make sure you're on a recent `main` (fixed 31 October 2026, PR #34)                                                   |
| Anything else                                      | `bun run db:stop && bun run db:start`, then ask in the team chat. Then fix this guide in your PR                      |

## Next

- [Architecture overview](../architecture/overview.md) and [data model](../architecture/data-model.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md): how a change gets from a branch to production
