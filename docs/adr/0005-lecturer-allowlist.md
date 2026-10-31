# ADR-0005: The lecturer role comes only from an allow-list

**Status:** Accepted
**Date:** 2026-10-30
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane
**Issue:** CRU-24

_Recorded retroactively on 31 October 2026._

## Context

`complete_signup` used to accept whichever role the browser asked for, so any university account could become a "lecturer". This was found in our own audit and listed as a correction in Security Overview v1.1.

## Decision

- Every account is a student unless its email is in `lecturer_allowlist`.
- `complete_signup` ignores the requested role and looks the email up in the allow-list.
- Only the service role can read or change `lecturer_allowlist`. University IT nominates addresses; a maintainer adds them in SQL, with an expiry agreed with IT, and removes them on request.

## Consequences

- IT stays in control of who sees cohort data.
- Adding a lecturer is a manual step for a maintainer, which is fine at pilot scale.
- The role is fixed at first sign-in. Promoting an existing account needs a manual update to `users.role`.
- Linking a lecturer to their courses is a separate manual step (see [data-model.md](../architecture/data-model.md#how-a-lecturer-gets-linked-to-a-course)).

## Alternatives considered

- **Self-selected role (the original):** anyone could see cohort aggregates.
- **Infer lecturers from a staff email domain:** the university uses one domain for everyone.
