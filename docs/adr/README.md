# Architecture decision records

An ADR records one significant decision: the context, what we chose, what we gave up, and what follows from it. They're how a new teammate learns _why_ Crunch is built the way it is, and how we avoid re-arguing settled questions.

## When to write one

Write an ADR in the same pull request when a change:

- picks or replaces a technology, service or provider;
- changes where a security or privacy rule is enforced;
- changes the data model in a way other code depends on;
- is hard to reverse, or someone is likely to ask "why did we do it this way?"

If unsure, write a short one. Ten lines is fine.

## How

1. Copy [template.md](template.md) to `NNNN-short-title.md`, using the next free number.
2. Status starts as **Proposed**. It becomes **Accepted** when the pull request merges.
3. **Don't rewrite an accepted ADR.** If a decision changes, write a new ADR that says what it supersedes, and change the old one's status to **Superseded by ADR-NNNN**. Typos and broken links can be fixed in place.
4. Add it to the index below.

ADRs 0002–0009 were written on 31 October 2026 for decisions already made and in production ("recorded retroactively"). Their dates are when the decision took effect.

## Index

| ADR                                             | Decision                                                                       | Status                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| [0001](0001-sync-pipeline.md)                   | Calendar sync runs as server functions inside the app                          | Accepted; partly superseded by 0002      |
| [0002](0002-sync-removes-stale-events.md)       | The sync removes events that leave the feed, with safeguards                   | Accepted                                 |
| [0003](0003-one-app-one-database.md)            | One TanStack Start app on Vercel, one Supabase database                        | Accepted                                 |
| [0004](0004-authorization-in-postgres.md)       | Authorization is enforced in Postgres                                          | Accepted                                 |
| [0005](0005-lecturer-allowlist.md)              | The lecturer role comes only from an allow-list                                | Accepted                                 |
| [0006](0006-university-only-signup.md)          | University-only sign-up is enforced by a Supabase Auth hook                    | Accepted                                 |
| [0007](0007-calendar-feed-urls.md)              | Feed URLs are encrypted at rest and fetched only from allowed hosts            | Accepted                                 |
| [0008](0008-cohort-minimum.md)                  | Lecturers see aggregates only, above a minimum cohort of 8                     | Accepted                                 |
| [0009](0009-nonce-csp.md)                       | A strict Content Security Policy with a per-request nonce                      | Accepted                                 |
| [0010](0010-scanner-safe-email-confirmation.md) | Email confirmation waits for a button press                                    | Accepted; live once CRU-33 is configured |
| [0011](0011-lecturer-onboarding.md)             | Pilot lecturers are onboarded with an admin script; IT-managed after the pilot | Accepted                                 |

### Expected next

Decisions on the CRU-48 meeting agenda will each need an ADR once they're made: email provider and domain, staging environment, repository visibility, monitoring, and the POPIA Information Officer.
