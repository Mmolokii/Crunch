-- CRU-56: the local and CI database get exactly production's grants.
--
-- The baseline is a pg_dump of production, and a dump only records GRANTs. A
-- fresh Supabase database also has default privileges that give anon and
-- authenticated ALL on every new table and EXECUTE on every new function, so
-- replaying the baseline left those in place: locally, anon could execute
-- every lecturer function and log_actual_hours, and both roles held
-- INSERT/UPDATE/DELETE/TRUNCATE on users, courses, events and week_scores.
-- RLS still blocked the row access, but the security CI job (CRU-54) was
-- testing a looser database than production.
--
-- Production already has (per the baseline dump and CRU-23):
--   authenticated: SELECT (+ MAINTAIN) on users, courses, events,
--                  week_scores, calendar_sources; EXECUTE on the functions
--   anon:          MAINTAIN only
-- In production this migration therefore only drops MAINTAIN (VACUUM,
-- ANALYZE, REINDEX, LOCK), which no API role needs. Locally it removes
-- everything above that list. scripts/check-grants.ts keeps the two in step.
-- Safe to re-run.

REVOKE ALL ON TABLE
  public.users, public.courses, public.events, public.week_scores, public.calendar_sources
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
  public.users, public.courses, public.events, public.week_scores, public.calendar_sources
TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.log_actual_hours(uuid, numeric),
  public.lecturer_courses(),
  public.lecturer_cohort_weeks(text, integer),
  public.lecturer_due_dates(text),
  public.lecturer_upsert_due_date(uuid, text, timestamptz, text, numeric, boolean, uuid),
  public.lecturer_delete_due_date(uuid),
  public.rls_auto_enable()
FROM PUBLIC, anon;
-- Only Supabase's own event trigger machinery uses rls_auto_enable.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
