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

## Tests

Unit tests live next to the code as `*.test.ts` and run with Bun's test runner (`bun run test`). Keep pure logic (parsing, scoring, validation) in modules with no I/O so it can be tested this way.

`scripts/adversarial-test-matrix.ts` checks row level security and the database functions against a real project using two student accounts; see its header for setup. Run it after any change to policies, grants or `SECURITY DEFINER` functions.

## Reporting security issues

Don't open a public issue. See [SECURITY.md](SECURITY.md).
