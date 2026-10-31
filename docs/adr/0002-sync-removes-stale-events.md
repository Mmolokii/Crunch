# ADR-0002: The sync removes events that leave the feed, with safeguards

**Status:** Accepted
**Date:** 2026-10-30
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane
**Issue:** CRU-35
**Supersedes:** the "left alone, not deleted" rule and per-event writes in [ADR-0001](0001-sync-pipeline.md)

_Recorded retroactively on 31 October 2026._

## Context

ADR-0001 kept any event that disappeared from a student's feed, so a student would never lose hours they'd logged. In practice, cancelled and rescheduled Brightspace items stayed in students' weeks forever and inflated their scores. The sync also wrote one event at a time (select, then insert or update), which was slow and assumed there were no database constraints to upsert on, which turned out to be wrong.

## Decision

- A synced event (`source = 'ics_sync'`) that is no longer in the feed is deleted, **unless** the student has logged hours on it or completed it.
- Lecturer-added events (`source = 'manual'`) are never deleted by the sync.
- An empty feed returns `empty` before anything is deleted, so a feed that briefly comes back blank can't wipe a calendar.
- Courses are written in one upsert on `(user_id, code)` and events in one upsert on `(course_id, external_uid)`. The event payload leaves out `actual_hours_logged` and `completed_at`, so a re-sync can't undo a student's own data.

The rules live in `src/lib/sync-plan.ts` and are unit tested.

## Consequences

- Weeks reflect what's actually in Brightspace.
- Data a student created is never removed by the sync.
- The unique constraint on `events (course_id, external_uid)` existed in production but not in the migrations; migration `20261030170000` now records it.

## Alternatives considered

- **Keep everything (ADR-0001):** scores drift further from reality every week.
- **Soft-delete with a hidden flag:** more columns and filters everywhere, for no user benefit yet.
