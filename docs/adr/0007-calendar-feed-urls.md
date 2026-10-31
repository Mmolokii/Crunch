# ADR-0007: Feed URLs are encrypted at rest and fetched only from allowed hosts

**Status:** Accepted
**Date:** 2026-10-30 (encryption since 2026-09-16)
**Deciders:** Mmoloki Kgololosego, Tshiamo Aphane
**Issues:** CRU-23, CRU-35

_Recorded retroactively on 31 October 2026._

## Context

A Brightspace calendar subscription URL contains a token: anyone with the link can read that student's calendar. Fetching a URL the user supplied is also the server's only outbound request, which makes it a server-side request forgery risk.

## Decision

- **Encryption:** feed URLs are stored with AES-256-GCM (random 12-byte IV, stored as `iv:tag:ciphertext`) using `ICS_URL_ENCRYPTION_KEY`, server-side only. Anything that won't decrypt is treated as invalid. `scripts/rotate-ics-encryption-key.ts` re-encrypts every row.
- **One fetch rule (`src/lib/ics-url.ts`):** HTTPS only, a host on `ICS_ALLOWED_HOSTS` (default `mystudies.iie.edu.za`), a Brightspace calendar-feed path, no credentials in the URL, default port only.
- The rule is checked when the URL is saved **and** right before every fetch, including after each of up to 3 redirects. Fetches time out after 15 seconds and stop at 5 MB.
- Students can't write `calendar_sources` directly (privileges revoked); saves go through `saveCalendarSource`.

## Consequences

- A database leak alone doesn't reveal students' calendars.
- The server can't be pointed at internal or arbitrary addresses.
- If the university changes its Brightspace host, feeds stop syncing until `ICS_ALLOWED_HOSTS` is updated. This already happened once (`mystudies.iie.edu.za`, CRU-23).
- Losing the encryption key means every student has to reconnect.

## Alternatives considered

- **Store URLs in plain text:** a leak exposes every calendar.
- **Validate only at save time:** a row changed some other way could still redirect the server.
