# Routes

TanStack Start uses file-based routing: each `.tsx` file here is a route, and
`routeTree.gen.ts` is generated from them on `bun run dev` / `bun run build`.
Don't edit the generated file, and don't add Next.js or Remix conventions
(`src/pages/`, `app/layout.tsx`); the only root layout is `__root.tsx`.

## Crunch's routes

| File                                    | URL                   | Who                        |
| --------------------------------------- | --------------------- | -------------------------- |
| `index.tsx`                             | `/`                   | Public landing page        |
| `about.tsx`, `privacy.tsx`, `terms.tsx` | `/about`, …           | Public                     |
| `contact.tsx`                           | `/contact`            | Public                     |
| `auth.tsx`                              | `/auth`               | Sign in and sign up        |
| `auth_.confirm.tsx`                     | `/auth/confirm`       | Email confirmation link    |
| `_authenticated/route.tsx`              | (layout)              | Gate: redirects to `/auth` |
| `_authenticated/onboarding.tsx`         | `/onboarding`         | Student: connect calendar  |
| `_authenticated/dashboard.tsx`          | `/dashboard`          | Student: upcoming weeks    |
| `_authenticated/today.tsx`              | `/today`              | Student                    |
| `_authenticated/week.$weekStart.tsx`    | `/week/2026-11-02`    | Student: one week          |
| `_authenticated/log-hours.tsx`          | `/log-hours`          | Student                    |
| `_authenticated/insights.tsx`           | `/insights`           | Student                    |
| `_authenticated/settings.tsx`           | `/settings`           | Both: sync, export, delete |
| `_authenticated/lecturer.index.tsx`     | `/lecturer`           | Lecturer: cohort heatmap   |
| `_authenticated/lecturer.due-dates.tsx` | `/lecturer/due-dates` | Lecturer: manual due dates |

`/api/cron/sync` isn't a route file: `src/server.ts` handles it before the
router (see `src/lib/cron-sync.ts`).

## Naming, in brief

- `_authenticated/` is a pathless layout: its children need a session, but
  `_authenticated` isn't part of the URL.
- `.` in a file name nests the URL (`lecturer.due-dates.tsx` → `/lecturer/due-dates`).
- `$name` is a URL parameter (`week.$weekStart.tsx`).
- A trailing `_` opts out of the parent layout (`auth_.confirm.tsx` is
  `/auth/confirm` without `auth.tsx` around it).

Every route exports `head()` metadata (see [AGENTS.md](../../AGENTS.md)).
