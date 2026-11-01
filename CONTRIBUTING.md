# Contributing to Crunch

Thanks for helping. This covers how to get set up and how a change gets to production. The code conventions and the security model are in [AGENTS.md](AGENTS.md); read that before your first PR.

## Setup

Follow [docs/guides/local-setup.md](docs/guides/local-setup.md): Bun, Node 22, Docker, then `bun run db:start`, `bun run db:env` and `bun run dev`. You work against a local database with fictional seed data, so you don't need production access or any secrets. Production secrets are never committed or shared in chat.

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
- **Grant exactly what the API roles need.** Supabase gives `anon` and `authenticated` ALL on every new table and EXECUTE on every new function unless your migration revokes it. `bun run db:grants` compares what those roles hold against `supabase/grants.txt`, and the `security` CI job fails on any difference. When a change is intended, run `bun run db:grants --update` and commit the new snapshot, so reviewers see the grant change as a diff.
- Production migrations are applied by hand after merging, with a backup first (see the PR template's "After merging"). Afterwards, check production matches the repo: run the query from `bun run db:fingerprint --sql` in the production SQL editor (it only reads, and returns hashes, no data), download the result as CSV, and run `bun run db:fingerprint --compare <file>.csv` against your local database. It lists any table, policy, function, trigger or grant that differs. Copy migrations as UTF-8: `pbcopy` in a shell without a UTF-8 locale turns `—` into `‚Äî`, which silently changes a function body (`LC_ALL=en_US.UTF-8 pbcopy < file.sql`). The fingerprint catches it.

## Tests

Unit tests live next to the code as `*.test.ts` and run with Bun's test runner (`bun run test`). Keep pure logic (parsing, scoring, validation) in modules with no I/O so it can be tested this way.

`scripts/adversarial-test-matrix.ts` attacks row level security and the database functions the way a malicious client would, as two student accounts using the anon key. CI's `security` job runs it on every PR against a local stack built from the migrations and the seed; run the same thing yourself with `bun run test:security` after `bun run db:start` and `bun run db:env`. Changes to policies, grants or `SECURITY DEFINER` functions should add a check for the new rule. After applying such a migration to production, run it there too (see the script's header for `.env.test`).

Smoke tests in `e2e/` drive a production build (with its strict CSP) in Chromium against the local stack, signing in as the seed accounts: landing page, sign-up refusal, student dashboard, lecturer heatmap and a first sign-in. Run them with `bun run test:e2e` after `bun run db:start` and `bun run db:env` (once: `bunx playwright install chromium`). CI's `e2e` job runs them on every PR. A test fails if the page throws or logs a console error, so a CSP violation is caught too. When you change a flow these cover, update the test in the same PR.

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
