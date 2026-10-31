# ADR-0011: Pilot lecturers are onboarded with an admin script; IT-managed after the pilot

**Status:** Accepted
**Date:** 2026-10-31
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane
**Issue:** CRU-51

## Context

Lecturer access is two things:

1. **The role**, from `lecturer_allowlist` at first sign-in ([ADR-0005](0005-lecturer-allowlist.md)).
2. **Their courses**: every `lecturer_*` function filters on `courses.lecturer_id`. Courses are per student, so the link has to be set on each student's row of the course.

Nothing in the app set the second part. Onboarding a lecturer meant hand-written SQL against production, with no record, no dry run and no way to undo it cleanly. This was found while documenting the data model (CRU-50) and blocks the lecturer test (CRU-17). The pilot will have one to a handful of lecturers, each nominated by university IT.

## Decision

For the pilot, one admin script, `scripts/lecturer.ts`, run by a maintainer with the service-role key:

- `courses` shows course codes, student counts and any current lecturer.
- `add <email> --courses …` allow-lists the email, promotes them if they already signed up as a student, and links every student row with those exact codes. It never overwrites another lecturer's link.
- `remove <email>` unlinks, demotes to student and deletes from the allow-list.
- `list` shows who has access to what.
- `add` and `remove` print a plan and only write with `--yes`. Each run is recorded on CRU-17 (who, which courses, the expiry IT asked for, kept in the allow-list `note`).

The rules (argument parsing, which rows to link) are pure functions in `src/lib/lecturer-admin.ts` with unit tests. The full lifecycle was tested against a local database built from the migrations, including calling the lecturer functions as the lecturer before and after removal.

## Consequences

- Onboarding is one reviewed, repeatable command with a dry run, instead of ad hoc SQL.
- It's still manual, and only a maintainer can do it. Fine for a handful of lecturers; it won't scale to a faculty.
- Students who join a course after the lecturer was linked aren't linked until the script runs again or the lecturer edits a due date.
- Expiry is recorded, not enforced. Someone has to remove access when it expires.
- Copying `lecturer_id` onto every student row stays as it is. It can't represent two lecturers on one course, and it has no audit trail (see below).

## After the pilot (recommended direction)

Move the source of truth for "who teaches what" to the university's own systems, so IT manages lecturers where they already manage staff and Crunch never has to be told by hand.

1. **A proper course-lecturer table.** Replace the copied `courses.lecturer_id` with `course_lecturers (course_code, school, lecturer_id, granted_by, granted_at, expires_at)`, and have the lecturer functions join on it. That allows co-lecturers, enforced expiry and an audit trail, and covers students who join later automatically. Worth doing as soon as a second lecturer joins, even before anything else.
2. **Roles from the university's identity provider.** The university runs Microsoft 365, so sign in with Microsoft Entra ID through Supabase (SAML SSO or the Azure provider). Grant the lecturer role from an Entra group that IT owns (for example "Crunch lecturers"). Joining and leaving staff are then handled by IT's normal processes, and the allow-list goes away. This needs IT's agreement and a Supabase plan with SSO.
3. **Courses from Brightspace.** Use the Brightspace (Valence) API's enrolments, where the lecturer is enrolled as instructor, in a nightly job that fills `course_lecturers`. No human maps lecturers to course codes at all. This needs IT to approve API access, which is a relationship milestone on the roadmap rather than a sprint.

Until step 2 or 3 exists, keep the script as the only way to grant lecturer access, and never grant it from inside the app.

## Alternatives considered

- **Keep hand-written SQL:** no dry run, no record, easy to get wrong in production.
- **An in-app admin page:** needs an admin role, its own security review and tests, which is more surface than a pilot with a few lecturers justifies.
- **Lecturers claim their own courses in the app:** without verification, anyone allow-listed could see any course's cohort. Only safe with step 3's data behind it.
