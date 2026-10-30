# Pilot go-live checklist

For the first time real students, and one lecturer, are invited to use Crunch. Work through it top to bottom: a gate that isn't fully ticked stops the launch. Copy it into the launch's Linear issue and tick it there, so there's a record of who checked what and when.

Production is crunch-taupe.vercel.app and the Supabase project **Crunch** (`xnlzbtyitbsgxzvugthy`). When something goes wrong, [runbook.md](runbook.md) takes over from this list.

|                |                 |
| -------------- | --------------- |
| Launch date    |                 |
| Launch lead    |                 |
| Second checker |                 |
| Pilot cohort   | course(s), size |

## Gate 1: blockers

Each of these is a reason not to launch. None of them is code that is still being written.

- [ ] **Production auth email** (CRU-33). Custom SMTP is configured in Supabase, and confirmation links use the `token_hash` flow. Supabase's built-in sender only allows a handful of emails an hour, so a class signing up together would be stuck waiting for confirmation emails.
- [ ] **Lecturer access approved by IT.** The address IT nominated is in `lecturer_allowlist`, with any expiry or conditions IT set recorded in the launch issue (Security Overview §12).
- [ ] **Lecturer screens verified** (CRU-17) with that account against real cohort data: heatmap, minimum-cohort threshold, due-date management.
- [ ] **Backups.** Either the project is on Supabase Pro (daily backups), or the team has agreed to manual dumps and a dump from the last 24 hours exists (runbook → Recovery).
- [ ] **POPIA** (CRU-38). The retention policy is decided and the Information Officer is named on the privacy page.
- [ ] **University IT has reviewed the Security Overview** and any conditions they attached are met.

## Gate 2: the day before

Production must be in the state students will see.

**Code and checks**

- [ ] `main` is green in CI, and nothing is merged after this point without telling the launch lead.
- [ ] `bun --env-file=.env.test scripts/adversarial-test-matrix.ts --signup-probe` passes every check against production.
- [ ] Dependabot shows 0 open alerts.

**Configuration** (check that each one is set; never paste values into the issue)

- [ ] Vercel Production has `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ICS_URL_ENCRYPTION_KEY` and `CRON_SECRET`, and `ICS_ALLOWED_HOSTS` is either unset or `mystudies.iie.edu.za`.
- [ ] Supabase → Authentication → URL Configuration: the Site URL is `https://crunch-taupe.vercel.app/`, and the redirect list holds only `https://crunch-taupe.vercel.app/**`.
- [ ] Supabase → Authentication → Auth Hooks: **Before User Created** is enabled and points at `public.hook_require_university_email`.
- [ ] Supabase → Authentication → Sign In / Providers: **Allow new users to sign up** is on.
- [ ] Every migration in `supabase/migrations/` is recorded in production:

  ```sql
  select version, name from supabase_migrations.schema_migrations order by version desc limit 10;
  ```

**The nightly sync**

- [ ] The last three nights each have a finished `sync_runs` row with `failed = 0` (or only `empty`):

  ```sql
  select started_at, finished_at, total, ok, failed, failures
  from sync_runs order by started_at desc limit 3;
  ```

**A full run-through as a new student** (use a throwaway `@myemeris.edu.za` account, then delete it)

- [ ] Signing up with a non-university address is refused.
- [ ] The confirmation email arrives within a minute, and its link signs you in.
- [ ] Onboarding accepts a real Brightspace link, and the first sync shows courses and deadlines.
- [ ] Dashboard, week detail, log hours and settings all work. **Sync now** works, and pressing it again straight away shows the cooldown message.
- [ ] **Download my data** produces a file; **Delete account** removes the account (check it's gone in Authentication → Users).
- [ ] The browser console on each page shows no errors.

**People**

- [ ] Both developers are free for the first two hours after launch and reachable for the first week.
- [ ] Students have one place to report problems (named in the invite), and someone is watching it.
- [ ] HIVE knows the launch date.

## Gate 3: launch day

1. **Take a fresh dump** if you're relying on manual backups.
2. **Invite a first wave of about five students.** Wait until all of them have signed up and synced before inviting the rest. This keeps any email or sync problem small.
3. **Watch the first wave** (about 30 minutes):
   - Supabase → Authentication → Users: each invited student appears.
   - Supabase → Logs → Auth: no repeated failures.
   - `calendar_sources`: one row per student who connected, with `last_synced_at` set.
   - Vercel → Logs: no `[cron-sync] ATTENTION` lines or new errors.
4. **Invite everyone else.**
5. **Add the lecturer** to `lecturer_allowlist` (if not already there) and send them their invite.
6. **Record in the launch issue:** the time each wave went out, how many accounts exist, and anything odd.

## Stop or roll back if

Decide this now, not during the launch.

| Signal                                                                            | Action                                                                                                                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Any student can see another student's data, or a lecturer can see a named student | **Sev 1.** Pause the Supabase project and follow the runbook.                                                                               |
| Confirmation emails aren't arriving                                               | Stop sending invites. Check the SMTP provider's dashboard, then the Auth logs.                                                              |
| More than one in five students' first syncs fail                                  | Stop sending invites. Check `failures` in `sync_runs` and the Vercel logs. `invalid_url` usually means students are pasting the wrong link. |
| A deploy breaks the site                                                          | Vercel → Deployments → the last good deployment → **Instant Rollback**.                                                                     |
| The site is up but unusable for everyone                                          | Roll back the deploy. If the database is the cause, pause the project and follow the runbook.                                               |

## The first week

Every morning, one developer:

- [ ] Checks last night's `sync_runs` row (it should be finished, with `failed = 0`).
- [ ] Scans Vercel logs for `ATTENTION` lines and Supabase Auth logs for unusual activity.
- [ ] Reads the problem-report channel and files anything real in Linear.

At the end of week one, write a short review in the launch issue covering signups versus invites, sync success rate, problems reported, and what to change before inviting more students.
