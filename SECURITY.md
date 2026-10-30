# Security policy

Crunch handles university students' calendar feeds and workload data, so we take reports seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub instead: go to this repository's **Security** tab and choose **Report a vulnerability**. Only the maintainers can see it.

Include what you found, how to reproduce it, and what an attacker could do with it. Please don't access other students' data beyond what you need to show the problem, and don't run tests that could disrupt the live service.

We aim to acknowledge reports within 3 working days and to keep you updated until a fix ships.

## Scope

In scope: the app at crunch-taupe.vercel.app, this repository, and the Supabase database behind it (row level security, database functions, auth rules).

Out of scope: Brightspace itself, Vercel's and Supabase's own platforms, and social engineering of the team.

## Supported versions

Only the latest deployment of `main` is supported. Fixes are deployed there; there are no older releases to patch.
