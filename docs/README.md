# Crunch documentation

Start here. Each document has one job; if you can't find something, it probably belongs in one of these and is missing. Add it.

## New to the codebase

1. [README](../README.md): what Crunch is, the stack, getting it running.
2. [Architecture overview](architecture/overview.md): how the pieces fit, how a request flows, the sync, scoring.
3. [Data model](architecture/data-model.md): tables, access rules, database functions.
4. [AGENTS.md](../AGENTS.md): conventions every change must follow, and the security model.
5. [CONTRIBUTING.md](../CONTRIBUTING.md): branches, reviews, tests, migrations, and how docs are kept current.

## Reference

| Document                                                 | Answers                                       | Owner                      |
| -------------------------------------------------------- | --------------------------------------------- | -------------------------- |
| [architecture/overview.md](architecture/overview.md)     | How does it work?                             | Mmoloki                    |
| [architecture/data-model.md](architecture/data-model.md) | What's in the database, and who can touch it? | Tshiamo                    |
| [adr/](adr/README.md)                                    | Why is it built this way?                     | Whoever makes the decision |
| [../src/routes/README.md](../src/routes/README.md)       | Which page is which file?                     | Mmoloki                    |
| [../SECURITY.md](../SECURITY.md)                         | How do I report a vulnerability?              | Both                       |

## Operations

| Document                                     | Use it when                           | Owner   |
| -------------------------------------------- | ------------------------------------- | ------- |
| [runbook.md](runbook.md)                     | Something is wrong in production      | Mmoloki |
| [go-live-checklist.md](go-live-checklist.md) | Inviting a new wave of pilot students | Mmoloki |

## Where other information lives

- **What we're doing and when:** Linear (team CRU). The roadmap is a Linear document.
- **Documents for HIVE and university IT** (Security Overview, progress decks): kept outside the repo for now. They should be generated from these docs, not maintained separately.

## Coming next

Tracked in CRU-50: a local setup guide and seed data (after the staging decision, CRU-34), a testing guide, a migrations guide, a privacy and retention page (after the POPIA decision, CRU-38), and a glossary.
