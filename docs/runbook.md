# Incident response runbook

What to do when something goes wrong with Crunch in production: a leaked secret, a data exposure, a bad deploy, or a broken sync. It is written to be followed under pressure, so each procedure is a checklist.

Production is the Vercel project serving crunch-taupe.vercel.app and the Supabase project **Crunch** (`xnlzbtyitbsgxzvugthy`, Emeris org).

## Who does what

| Role              | Who                                                 | Responsible for                                                     |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Incident lead     | Whichever maintainer notices first                  | Running this checklist, keeping the incident log, deciding severity |
| Second maintainer | The other of Mmoloki Kgololosego and Tshiamo Aphane | Checking each action, taking over if the lead is unavailable        |
| Programme contact | HIVE Student Innovation Programme                   | Told about every Sev 1 and Sev 2 within 24 hours                    |
| University IT     | Emeris University IT Department                     | Told about anything affecting student data or university accounts   |

Contact details live in the team's private channel and in Linear, not in this public repository. Both maintainers have admin access to GitHub, Vercel and Supabase; neither should act alone on a Sev 1 if the other can be reached within the hour.

## Severity

| Severity  | Examples                                                                                                   | Respond within |
| --------- | ---------------------------------------------------------------------------------------------------------- | -------------- |
| **Sev 1** | A secret is exposed; one student can read another's data; a database compromise is suspected               | Immediately    |
| **Sev 2** | The app is down for everyone; signups or sign-in are broken; a vulnerability is reported but not exploited | Same day       |
| **Sev 3** | The nightly sync fails for some students; one screen is broken; a dependency advisory affects production   | 3 working days |

When unsure, pick the higher severity. It can be lowered later.

## The first 15 minutes (every incident)

1. **Open a Linear issue** in the CRU team titled `Incident: <what is happening>`, priority Urgent. This is the incident log: record every action with the time.
2. **Tell the other maintainer.**
3. **Decide severity** using the table above.
4. **Preserve evidence before changing anything:** export the relevant Vercel function logs and Supabase logs (Logs → API, Auth, Postgres) for the time window, and save them outside the repo.
   - **Who did what in Auth** (sign-ins, signups, account deletions, admin actions) is in **Logs → Auth**. Open an entry to see its `action` (for example `user_deleted`, `login`), `actor_username`, `path` and `status`. The `auth.audit_log_entries` table is **not** written on this project, so don't rely on it.
   - Supabase keeps these logs for a limited time on the Free plan (about a day), so export them in the first hour.
5. **Contain** using the procedures below. Containing comes before diagnosing.

## Containment procedures

### A secret has leaked

A secret counts as leaked if it appeared in a commit, a log, a screenshot, a chat, or anywhere outside Vercel's environment settings and a maintainer's local `.env`.

| Secret                                          | How to rotate                                                                                                                                                                                                                                                                                                                    | Effect                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`                     | Supabase → Project Settings → API Keys: create a new secret key, set it as `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Production), redeploy, then delete the old key. If the project still uses the legacy JWT `service_role` key, rotating it also invalidates the anon key and every session; migrate to the new API keys instead. | Sync and signup use the new key; the old one stops working |
| `ICS_URL_ENCRYPTION_KEY`                        | Generate a new key (`openssl rand -hex 32`). Run `bun run scripts/rotate-ics-encryption-key.ts` with the current key and `NEW_ICS_URL_ENCRYPTION_KEY` set, check the dry run, then rerun with `--apply`. Set the new key in Vercel and redeploy.                                                                                 | Every saved feed URL is re-encrypted under the new key     |
| `CRON_SECRET`                                   | Generate a new value (`openssl rand -hex 32`), set it in Vercel, redeploy. Vercel Cron sends it automatically.                                                                                                                                                                                                                   | Old value can no longer trigger the nightly sync           |
| A student's calendar feed URL                   | Ask the student to reset their calendar subscription link in Brightspace (Calendar → Subscribe), then save the new link in Crunch settings.                                                                                                                                                                                      | The leaked link stops working at Brightspace               |
| A maintainer's GitHub, Vercel or Supabase login | Change the password, revoke sessions and tokens, and check the account's security log for actions you don't recognise.                                                                                                                                                                                                           | —                                                          |

If a secret was committed to git, rotate it first; removing it from history comes second and doesn't make it safe again.

### Stop new accounts

Supabase → Authentication → Sign In / Providers → turn off **Allow new users to sign up**. Existing users can still sign in.

### Sign everyone out

Rotating the JWT signing key in Supabase (Project Settings → JWT Keys) invalidates every session. Use only for a Sev 1 where sessions may be compromised.

### Take the app offline

- **A bad deploy:** Vercel → Deployments → pick the last good deployment → **Instant Rollback**. Production is served from it within seconds.
- **Stop all access to student data:** Supabase → Project Settings → General → **Pause project**. The site still loads but cannot read or write any data. Restoring takes a few minutes.

### Remove a student's access

Supabase → Authentication → Users → the user → **Delete user**. Their rows in `users`, `calendar_sources`, `courses`, `events`, `week_scores` and `notification_preferences` are removed through the foreign-key cascades from `auth.users`.

### Remove a lecturer's access

`bun --env-file=.env scripts/lecturer.ts remove name@myemeris.edu.za --yes`. It unlinks their courses, demotes them to student and removes them from the allow-list, so the lecturer functions return nothing from their next request. To block the account completely, also delete the user as above.

### See what a lecturer changed

Every add, edit and delete of a due date writes a row to `lecturer_audit_log`. In the Supabase SQL editor:

```sql
-- The latest changes, newest first. Join to users for the lecturer's email.
select l.at, u.email, l.action, l.course_code, l.old_values, l.new_values, l.copies
from lecturer_audit_log l left join users u on u.id = l.lecturer_id
order by l.at desc limit 50;
```

An empty `email` means the lecturer's account has since been deleted. `scripts/lecturer.ts` changes (adding, removing and linking lecturers) aren't in this log.

## Checking the nightly sync

Every nightly run writes a row to `sync_runs` (kept for 90 days). In the Supabase SQL editor:

```sql
-- The last two weeks of runs, newest first
select started_at, finished_at, total, ok, failed, failures, duration_ms
from sync_runs order by started_at desc limit 14;
```

- **No row for last night:** the schedule didn't fire. Check Vercel → the project → Settings → Cron Jobs, and that `CRON_SECRET` is still set.
- **A row with no `finished_at`:** the run died part-way, most likely a function timeout. Check Vercel's function logs for that time.
- **`failed` above 0:** `failures` lists each calendar source and its status. `unreachable` usually means Brightspace was down or the student's link changed; `invalid_url` means the stored link no longer passes the allow-list. Runs with real failures also log a line starting `[cron-sync] ATTENTION` in Vercel's function logs.

## Monitoring and alerts

Three things email the team; none needs anyone to look first.

| Alert                                           | Comes from                                                   | Means                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| "nightly-sync is DOWN" (Healthchecks.io)        | `HEALTHCHECK_SYNC_URL`: a fail ping, or no ping by 04:00 UTC | Last night failed, never finished, or never ran. Start at "Checking the nightly sync" above   |
| "Crunch nightly sync: N of M calendars failed"  | Resend (`RESEND_API_KEY`, `SYNC_ALERT_TO`)                   | The run finished but some feeds failed. The email lists source ids and statuses               |
| "crunch-taupe.vercel.app is down" (UptimeRobot) | HTTP checks on `/` and `/auth` every 5 minutes               | The site isn't answering. Check Vercel's status and deployments, then treat it as an incident |

**Setting them up (once):**

1. **Healthchecks.io** (free): create a check named `nightly-sync`, schedule **Cron** `0 2 * * *`, time zone UTC, grace **2 hours**. Add both of us as email integrations. Copy its ping URL into Vercel's Production env as `HEALTHCHECK_SYNC_URL` and redeploy. The next 02:00 run turns the check green.
2. **UptimeRobot** (free): two HTTP(s) monitors, `https://crunch-taupe.vercel.app/` and `/auth`, every 5 minutes, alerting both of us by email.
3. **Resend** (free) for the per-calendar detail email: an API key in `RESEND_API_KEY` and our addresses in `SYNC_ALERT_TO`. Until a domain is verified, Resend's test sender only delivers to the account owner's address.

None of them receives student data: Healthchecks gets counts (`total=… ok=… failed=…`), UptimeRobot only our public URLs.

## Pilot metrics

How the pilot is going, per week, from data Crunch already has (CRU-49). No analytics tool, no third party: counts only, run in the Supabase SQL editor by the team, never exposed to students. Use it for the end-of-week-one review in the go-live checklist, then weekly.

```sql
-- Pilot metrics, one row per week (Monday, UTC). Counts only; run in the SQL editor.
with weeks as (
  select generate_series(
    date_trunc('week', (select min(created_at) from public.users)),
    date_trunc('week', now()),
    interval '1 week'
  ) as week
),
logins as (
  select date_trunc('week', a.created_at) as week, u.role, count(distinct u.id) as n
  from auth.audit_log_entries a
  join public.users u on u.id::text = a.payload->>'actor_id'
  where a.payload->>'action' = 'login'
  group by 1, 2
),
syncs as (
  select date_trunc('week', started_at) as week, sum(ok) as ok, sum(total) as total,
         count(*) as runs, count(*) filter (where finished_at is null) as unfinished
  from public.sync_runs group by 1
)
select
  w.week::date as week_of,
  (select count(*) from public.users u
     where u.role = 'student' and u.created_at < w.week + interval '1 week') as students_total,
  (select count(*) from public.users u
     where u.role = 'student' and date_trunc('week', u.created_at) = w.week) as new_students,
  (select round(100.0 * count(distinct c.user_id) / nullif(count(distinct u.id), 0))
     from public.users u
     left join public.calendar_sources c
       on c.user_id = u.id and c.created_at < w.week + interval '1 week'
     where u.role = 'student' and u.created_at < w.week + interval '1 week') as pct_connected,
  coalesce((select n from logins l where l.week = w.week and l.role = 'student'), 0) as active_students,
  coalesce((select n from logins l where l.week = w.week and l.role = 'lecturer'), 0) as active_lecturers,
  (select round(100.0 * s.ok / nullif(s.total, 0)) from syncs s where s.week = w.week) as pct_sync_ok,
  (select s.runs || ' runs, ' || s.unfinished || ' unfinished' from syncs s where s.week = w.week) as sync_runs
from weeks w
order by w.week desc;

-- Logged hours has no timestamp, so this one is to date, not per week.
select
  count(distinct u.id) filter (where e.actual_hours_logged is not null) as students_who_logged_hours,
  count(distinct u.id) as students,
  round(100.0 * count(distinct u.id) filter (where e.actual_hours_logged is not null)
        / nullif(count(distinct u.id), 0)) as pct
from public.users u
left join public.courses c on c.user_id = u.id
left join public.events e on e.course_id = c.id
where u.role = 'student';
```

- **`active_students` / `active_lecturers`**: distinct people who signed in that week, from Supabase Auth's audit log. If these stay at 0 while people are clearly using the app, the audit log is turned off (Authentication → Settings).
- **`pct_connected`**: students who had saved a calendar feed by the end of that week.
- **`pct_sync_ok`**: share of calendars the nightly runs synced cleanly (`empty` counts as not OK here, so expect it lower between semesters).
- **Invites** aren't recorded anywhere, so compare `students_total` with the number of invitations sent by hand.

## Notification

Crunch handles personal information under South Africa's Protection of Personal Information Act (POPIA).

- **Any Sev 1, and any Sev 2 involving student data:** tell the HIVE programme contact and university IT within 24 hours, with what happened, what data, how many students, and what has been done.
- **If personal information may have been accessed or acquired by someone unauthorised** (section 22 of POPIA), the Information Regulator and the affected students must be notified as soon as reasonably possible after the compromise is discovered. Agree with HIVE and university IT who sends the notice to the Regulator (see inforegulator.org.za) before it goes. The notice to students says what happened, what data was involved, what they should do (for example, reset their Brightspace calendar link), and who to contact.
- **Don't speculate** in any notice. State what is known and when an update will follow.

## Recovery

### Database restore

**The project is on Supabase's Free plan, which includes no automatic backups** (CRU-42). Until the plan is upgraded (Pro keeps 7 days of daily backups), the only restore point is a manual dump taken with `scripts/backup-db.sh`:

```sh
SUPABASE_DB_URL='<Supabase → Connect → Session pooler URI>' \
BACKUP_PASSPHRASE='<from the password manager>' \
scripts/backup-db.sh
```

Percent-encode the database password in the URI if it has characters like `@`, `/`, `#` or `?`; otherwise the login fails. If a run fails, it leaves no file behind.

It needs `pg_dump` 17 (`brew install libpq`), or Docker, in which case it uses the official `postgres:17` image. It dumps the `public`, `auth` and `supabase_migrations` schemas and encrypts the dump before it touches disk. It then checks the file can be decrypted and read, writes it to `~/CrunchBackups` (owner-only, outside the repo), and deletes encrypted dumps older than 30 days, because they hold personal information. Take one **before every production migration, weekly, and on launch day**. The privacy page tells students backups expire after about 30 days. The cleanup only runs when this script does, so keep to the weekly backup, and delete any copy kept elsewhere on the same schedule. Without the passphrase, a dump can't be restored, so keep it in the team's password manager. `scripts/backup-db.sh --self-test` checks the encryption without touching the database.

**Practise it: the restore drill.** A backup nobody has restored is a guess. `scripts/restore-drill.sh` restores the newest dump into the **local** stack (schema rebuilt from `supabase/migrations/`, the same way a replacement project would be), then prints row counts and checks for orphaned rows. It streams the decrypted dump and never writes it to disk.

```sh
bun run db:start
BACKUP_PASSPHRASE='<from the password manager>' scripts/restore-drill.sh   # or pass a specific .dump.enc
bun run db:reset   # afterwards: wipes the restored personal data
```

Compare the counts with production's Table editor, then add a line to the drill log below. Do one before launch and after any change to the backup script or the auth schema.

| Date       | Dump                                                                     | Result                                                                                                             | By      |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------- |
| 2026-11-01 | Local seed (dry run of the script)                                       | Restored; accounts sign in; adversarial matrix passes on the restored data                                         | Mmoloki |
| 2026-11-01 | `crunch-20261101T0958Z` (production, taken before applying CRU-52/55/56) | Restored; all 12 row counts match production (6 accounts, 200 events); 0 orphans; local copy wiped with `db:reset` | Mmoloki |

**To restore for real** (into a new project, never straight onto production):

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE \
  -in ~/CrunchBackups/crunch-<stamp>.dump.enc -out /tmp/crunch.dump
pg_restore --list /tmp/crunch.dump                         # check what's inside
pg_restore --data-only --schema=public --dbname="$TARGET_DB_URL" /tmp/crunch.dump
rm /tmp/crunch.dump
```

Restore into a project whose schema already matches (apply `supabase/migrations/` first). Restoring `auth` (accounts) into another project is more involved; follow Supabase's migration guide, and treat that as a reason to prefer Pro.

Schema can always be rebuilt from `supabase/migrations/`; student data can only come from a dump. If data is lost with no dump, students reconnect their calendar feeds and the next sync rebuilds their courses and deadlines. Logged hours cannot be recovered that way.

### After a fix

1. Run `bun --env-file=.env.test scripts/adversarial-test-matrix.ts --signup-probe` against production. All checks should pass.
2. Watch the next nightly sync (`calendar_sources.last_synced_at` should move forward for every row).
3. Lift any containment you applied (signups, paused project).

## Afterwards

Within 5 working days, write a short review in the incident's Linear issue:

- a timeline from first sign to resolution;
- the cause, including why existing checks didn't catch it;
- what was changed, with links to the PRs;
- follow-up issues, each filed in Linear with an owner.

The review is blameless: it is about how the system allowed the problem, not who made a mistake.

## Keeping this current

Review this runbook when a secret, provider or plan changes, and at least once a semester. Run through one containment procedure on a non-production project each time, so the steps are known to work before they are needed.
