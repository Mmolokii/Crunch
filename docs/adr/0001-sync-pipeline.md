# ADR-0001: Calendar sync pipeline architecture

**Status:** Accepted
**Date:** 2026-09-16
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane

## Context

Crunch's original build plan assumed an external Next.js sync service already existed and that Crunch would only call out to it with a shared secret. That service was never confirmed to exist, and we've since decided to stop depending on any external party for it (see project decision to abandon Lovable as an intermediary). Every student-facing screen (dashboard, today, week detail, insights, log-hours) and the lecturer cohort heatmap depend entirely on real rows landing in `courses` and `events` — and per the existing RLS grants, only the service-role key can write those tables. This is the single blocker gating the rest of the MVP.

We now own this pipeline outright, end to end, inside the Crunch repo.

## Decision

Build the sync pipeline as TanStack Start server functions inside this app, using the existing `client.server.ts` service-role client — not a separate service, not a Supabase Edge Function.

Reasoning: we're a two-person team at pilot scale (dozens to low hundreds of students, one institution). A second deployment target (Deno Edge Functions) or a second service (a standalone Next.js app) adds an operational surface — a second place secrets live, a second language/runtime, a second thing that can be down — without a scaling need that justifies it yet. TanStack Start server functions already have the auth middleware, the service-role client pattern, and the validation conventions (`AGENTS.md`) this codebase uses everywhere else. Revisit this decision in **Crunch — Multi-Institution Expansion** if a single serverless function's time limits become a real constraint at higher student counts.

### Components

**`runCalendarSync(calendarSourceId)`** — the core function. Fetches the ICS feed, parses it, classifies each event, and upserts into `courses`/`events`. Returns one of: `ok` (with course/event counts), `invalid_url`, `unreachable`, or `empty`. This one function is called from all three trigger points below — there is exactly one sync code path, not three.

**Trigger 1 — Onboarding.** `saveCalendarSource` calls `runCalendarSync` synchronously before returning, so the onboarding screen can show `invalid_url`/`unreachable`/`empty`/`done` from a real result instead of inferring state from a separate `getMyCourses().length === 0` check afterward (today's actual behavior in `onboarding.tsx`, and dishonest about what's actually happening).

**Trigger 2 — Settings "Sync now."** A new manual action calling the same function, for a student who wants to re-check without re-entering their URL.

**Trigger 3 — Nightly cron.** A new authenticated route, hit by a scheduled job (Vercel Cron, since `vercel.json` already implies that platform), iterating every `calendar_sources` row and calling `runCalendarSync` for each. Authenticated by a secret header — repurpose the unused `LOVABLE_CRON_SECRET` env var as `CRON_SECRET` (see CRU-12). One student's feed failing must never block the rest of the batch; log and continue.

### Upsert semantics

- Upsert key: `(course_id, external_uid)`, where `external_uid` is the ICS `UID` property of each `VEVENT` — Brightspace/D2L calendar subscription feeds emit a stable UID per calendar item, so this holds across re-syncs.
- The sync `UPDATE` only ever touches `title`, `due_at`, `type`, `estimated_hours`, `is_high_stakes`. It never writes `actual_hours_logged` or `completed_at` — those columns are simply absent from the `SET` clause, so a re-sync can't silently undo a student's logged hours or completion, by construction rather than by a check we have to remember to write.
- An event present last sync but missing from the current feed is left alone, not deleted. A student who logged hours against something Brightspace later removed shouldn't lose that record.
- Course discovery: one course row per distinct course identified in the feed (grouping key TBD against a real sample — see risk below), created on first sight, matched by `(user_id, code)` on subsequent syncs.

### Event type classification

Brightspace ICS entries carry no `problem_set`/`essay`/`exam`/`quiz`/`reading`/`other` field — Crunch has to infer it, since there's no external classifier anymore. MVP approach: a keyword-matching heuristic against the event title/summary (e.g. "exam"/"test" → `exam`, "quiz" → `quiz`, "essay"/"paper" → `essay`, "reading" → `reading`, "assignment"/"problem set"/"homework" → `problem_set`), defaulting to `other` when nothing matches. `other` is a valid canonical type, so an unclassified event degrades gracefully rather than failing. Revisit accuracy once real Brightspace data is flowing — this is exactly the kind of thing **Crunch — Pilot Validation** exists to surface.

### Failure handling

`runCalendarSync` wraps the fetch in an `AbortController` timeout (15s). Result mapping: non-ICS or malformed content → `invalid_url`; timeout, network error, or non-2xx → `unreachable` (the URL is still saved — the nightly run will retry); parsed successfully with zero `VEVENT` entries → `empty`; otherwise `ok`. No retry/backoff logic beyond "the nightly cron tries again tomorrow" and "the student can hit Sync now" — anything more is unwarranted complexity at this scale.

## Options considered

### Option A: Server functions in this app (chosen)

| Dimension        | Assessment                                           |
| ---------------- | ---------------------------------------------------- |
| Complexity       | Low — reuses existing patterns, no new deploy target |
| Cost             | None beyond existing hosting                         |
| Scalability      | Fine to low hundreds of students; revisit past that  |
| Team familiarity | High — same stack as everything else in the repo     |

### Option B: Supabase Edge Function

**Pros:** Runs close to the database; separates sync concerns from the web app's deploy.
**Cons:** Second runtime (Deno) and deploy target for a two-person team to maintain; secrets now live in two places instead of one; no scaling need at pilot size justifies the split.

### Option C: Revive the external Next.js relay assumption

**Cons:** This is what we're explicitly moving away from — depends on a service that was never confirmed to exist, and puts the project's biggest blocker outside the team's own control. Rejected.

## Consequences

- Every student and lecturer screen can finally show real data once this ships — it's the one piece the rest of M2, M3, and M4 all wait on.
- The event classifier will misclassify some events at launch. That's an accepted, visible limitation (falls back to `other`), not a silent failure.
- We need one real sample Brightspace/D2L ICS export before writing the parser and classifier for real — building blind against assumed ICS structure risks getting the course-grouping logic wrong and having to redo it. This is the first action item below, ahead of any code.
- If student counts grow enough that a single nightly cron invocation risks a serverless function's time limit, batching or a queue becomes necessary — tracked for **Crunch — Multi-Institution Expansion**, not now.

## Action items

1. [x] Get one real Brightspace/D2L calendar subscription export (from an actual `@myemeris.edu.za` account) to build and test the parser and classifier against real structure, not assumptions.
2. [x] Implement `runCalendarSync` (ICS fetch, parse, classify, upsert) — CRU-10.
3. [ ] Wire onboarding and settings to synchronous results from it — CRU-11.
4. [ ] Add the nightly cron route and rename `LOVABLE_CRON_SECRET` → `CRON_SECRET` — CRU-12.
5. [x] Implement calendar URL encryption at rest (CRU-9) — independent of this ADR's decisions, can proceed in parallel.

## Addendum: what the real sample changed (2026-09-16)

A real export confirmed some assumptions above and corrected others. Recorded here rather than silently rewriting the decisions above, so the reasoning trail stays honest.

**Confirmed:** `UID` is stable and namespaced per event (`6606-<eventid>@mystudies.iie.edu.za`) — the upsert key holds as designed. `DTSTART`/`DTEND` are UTC.

**Corrected — course identification.** The original plan didn't specify where a course code would come from. The real feed carries it in `LOCATION`, not `SUMMARY` or `DESCRIPTION`: every `VEVENT`'s `LOCATION` is a scheduling string like `Programming 2A PROG6221 2026 FT BCAD0701 EMGPMD Term1 GR01`, from which both a course code (`PROG6221`, pattern `[A-Z]{4}\d{4}`) and a human name (everything before the code) are extracted directly — no guessing required.

**Corrected — classifier signal.** `DESCRIPTION` is prefixed with a category Brightspace assigns itself: `Assignments:`, `Quizzes:`, `Surveys:`, `Discussions:`. This is a stronger signal than the title-keyword heuristic originally planned and is checked first; the title-keyword pass (exam/quiz/essay/reading/assignment) still runs as a fallback and to split assignment-shaped titles (e.g. an essay is still an `Assignments:`-category item in the feed).

**New finding — duplicate markers.** Every quiz produces three separate `VEVENT`s for one deliverable: `<title> – Available`, `<title> – Due`, `<title> – Availability Ends`. Only the `– Due` marker is an actual deadline; the other two are access-window bookends. The classifier now flags `Available`/`Availability Ends` events with `skip: true` so they're never synced as their own due items — syncing all three would show a student three cards for one quiz.

**Untested — exam classification.** The sample was pulled outside exam period and contained zero exam-type events. The `exam` branch of the classifier is unverified against real data; revisit once a feed spanning an exam period is available (tracked under **Crunch — Pilot Validation**).

**Confirmed — no DB-level upsert constraint.** Neither `events (course_id, external_uid)` nor `courses (user_id, code)` has a unique constraint in the migration history. `runCalendarSync` does a manual check-then-insert/update per row, matching the existing pattern in `lecturer_upsert_due_date` (which does the same rather than relying on `ON CONFLICT`). `events.source` for synced rows is `'ics_sync'`, the value the existing `events_source_check` constraint already expects (alongside `'manual'`).

**Open, not blocking:** the base schema for `users`/`calendar_sources`/`courses`/`events`/`week_scores` predates this repo's migration history — there's no `CREATE TABLE` for any of them in `supabase/migrations/`. Worth a follow-up issue to pull a baseline schema dump into version control so the repo is self-contained, but doesn't block sync from working today.

## Addendum: Trigger 3 implementation (2026-09-17)

**Corrected — no `LOVABLE_CRON_SECRET` to repurpose, and no `vercel.json`.** Neither actually exists in this repo — a search of every file turned up nothing. Both assumptions in the original decision above came from the old `.lovable/plan/` build plan, which was deleted as part of the Lovable break and never matched what was actually committed. `CRON_SECRET` is a new env var, not a rename, and the deploy target (Vercel or otherwise) is still CRU-19's decision to make, not this ADR's.

**Corrected — not a TanStack Start file-based route.** The plan assumed "a new authenticated route" without specifying how. This repo's pinned `@tanstack/react-start` version (1.168.32) has no verified public API for a request/response-only route with no page component — chasing the actual `RouteOptions`/`server` type surface through `node_modules` turned up generic plumbing (`TServerMiddlewares`, `THandlers`) but no documented way to invoke it with confidence it'd compile. Rather than guess at unverified internals, Trigger 3 is handled directly in `src/server.ts`'s existing custom `fetch` handler — every request already passes through it before reaching TanStack Start's SSR handler, so a path check for `/api/cron/sync` ahead of that call is a small, certain addition instead of a speculative one. The actual sync logic lives in `src/lib/cron-sync.ts` (`handleNightlySync`), kept separate so `server.ts` stays a thin dispatcher.

**Still open:** this ships the endpoint, not the schedule. `POST /api/cron/sync` with `Authorization: Bearer $CRON_SECRET` runs a full sync pass right now and can be triggered manually or from CI — but nothing calls it nightly yet. That's blocked on CRU-19 (deploy target), since the scheduling mechanism differs by platform (Vercel Cron config, a GitHub Actions scheduled workflow, Supabase `pg_cron` + `pg_net`, …).
