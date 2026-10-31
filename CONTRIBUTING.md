# Contributing to Crunch

Thanks for helping. This covers how to get set up and how a change gets to production. The code conventions and the security model are in [AGENTS.md](AGENTS.md); read that before your first PR.

## Setup

Follow **Getting started** in the [README](README.md): Bun, Node 22 (`nvm use`), `bun install`, then copy `.env.example` to `.env`. Ask a maintainer for the values; secrets are never committed or shared in chat.

## Making a change

1. **Pick or file a Linear issue** in the CRU team. Every change should trace back to one.
2. **Branch off `main`** as `<type>/<issue-key>-<slug>`, for example `fix/cru-23-lock-down-calendar-feed-urls`. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
3. **Commit** with the same prefix: `fix(cru-23): validate calendar feed URLs at fetch time`. Keep each commit to one area.
4. **Check locally** before pushing:
   ```sh
   bun run lint
   bun run test
   bun run build
   bun run typecheck   # after build: it needs the generated route tree
   ```
5. **Open a PR** and fill in the template, including how you tested it and anything that must be done by hand after merging.

## Review and merge

- `main` is protected: it needs a pull request, one approving review and a passing `check` CI job. Merges are squash-only, and force-pushes are blocked.
- CODEOWNERS requests a review automatically. Database migrations, auth and anything touching the service-role client get the closest look.
- Merging deploys to production on Vercel. Database migrations are **not** applied automatically: whoever merges applies them to production and records them, as described in the PR.

## Database changes

- Add one migration per change to `supabase/migrations/`, named `YYYYMMDDHHMMSS_cru_<n>_<slug>.sql`, following the rules in [AGENTS.md](AGENTS.md#database-changes).
- **Test it locally first.** `bun run db:start` (Docker) builds a fresh database from every migration; `bun run db:reset` rebuilds it after you add one. If your migration can't apply cleanly from scratch, the `schema` CI job will fail too.
- **Regenerate the types in the same PR:** `bun run db:types` rewrites `src/integrations/supabase/types.ts` from the local database. The `schema` CI job fails if the committed file doesn't match the migrations. Don't edit `types.ts` by hand.
- Production migrations are applied by hand after merging, with a backup first (see the PR template's "After merging").

## Tests

Unit tests live next to the code as `*.test.ts` and run with Bun's test runner (`bun run test`). Keep pure logic (parsing, scoring, validation) in modules with no I/O so it can be tested this way.

`scripts/adversarial-test-matrix.ts` checks row level security and the database functions against a real project using two student accounts; see its header for setup. Run it after any change to policies, grants or `SECURITY DEFINER` functions.

## Keeping docs current

Docs live in the repo and change in the same pull request as the behaviour they describe. A reviewer should ask for the doc change the same way they'd ask for a test. The map of what lives where is [docs/README.md](docs/README.md).

- **Changed how something works?** Update the doc that describes it: the [architecture overview](docs/architecture/overview.md), the [data model](docs/architecture/data-model.md), the [runbook](docs/runbook.md), the README's environment table, or `AGENTS.md`.
- **Made or reversed a significant decision?** Add an ADR (see [docs/adr/README.md](docs/adr/README.md)). Never rewrite an accepted ADR; supersede it.
- **Changed the schema?** Update the data model and regenerate `src/integrations/supabase/types.ts` in the same PR.
- **New env var?** Add it to `.env.example` and the README table.
- **Found a doc that's wrong?** Fix it in your PR, or file a Linear issue if it's bigger.

Each doc names an owner and a "last reviewed" date. At the start of each semester, the owners walk through their docs (a recurring Linear issue), and the runbook is also checked after every incident. A new contributor's first task is to follow the setup steps and fix whatever was unclear.

## Reporting security issues

Don't open a public issue. See [SECURITY.md](SECURITY.md).

## When something goes wrong in production

Follow [docs/runbook.md](docs/runbook.md): severity levels, how to rotate each secret, how to stop signups or take the app offline, and who must be told.
