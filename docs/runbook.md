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

## Notification

Crunch handles personal information under South Africa's Protection of Personal Information Act (POPIA).

- **Any Sev 1, and any Sev 2 involving student data:** tell the HIVE programme contact and university IT within 24 hours, with what happened, what data, how many students, and what has been done.
- **If personal information may have been accessed or acquired by someone unauthorised** (section 22 of POPIA), the Information Regulator and the affected students must be notified as soon as reasonably possible after the compromise is discovered. Agree with HIVE and university IT who sends the notice to the Regulator (see inforegulator.org.za) before it goes. The notice to students says what happened, what data was involved, what they should do (for example, reset their Brightspace calendar link), and who to contact.
- **Don't speculate** in any notice. State what is known and when an update will follow.

## Recovery

### Database restore

**The project is on Supabase's Free plan, which includes no automatic backups.** Until the plan is upgraded (Pro keeps 7 days of daily backups), the only restore point is a manual dump:

```sh
supabase db dump --linked -f schema.sql
supabase db dump --linked --data-only -f data.sql
```

Take one before applying any migration to production and at least weekly. Dumps contain personal information: store them encrypted, outside the repository, and delete them after 30 days.

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
