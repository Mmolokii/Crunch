Fixes CRU-

## What and why

<!-- What changes, and the problem it solves. Link the Linear issue above. -->

## How it was tested

<!-- Commands run, screens checked, accounts used. "CI passes" alone isn't enough for UI or data changes. -->

## Checklist

- [ ] `bun run lint`, `bun run test`, `bun run build` and `bun run typecheck` pass
- [ ] New or changed server functions validate input with Zod (`inputValidator`)
- [ ] New routes export `head()` metadata
- [ ] Migrations are additive, and include their RLS policies and `GRANT`/`REVOKE`
- [ ] Privileged checks live in Postgres or server functions, never in the browser
- [ ] No secrets, feed URLs or personal data in code, logs or this PR
- [ ] Docs updated in this PR, or not needed because: <!-- one line -->
- [ ] A decision that is new, changed or reversed has an ADR in `docs/adr/` (or none was made)

## After merging

<!-- Anything someone must do by hand: apply a migration, set an env var, flip a dashboard setting. Write "Nothing" if so. -->
