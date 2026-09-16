DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.complete_signup(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_actual_hours(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecturer_upsert_due_date(uuid, text, timestamptz, text, numeric, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecturer_delete_due_date(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecturer_courses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecturer_due_dates(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecturer_cohort_weeks(text, integer) TO authenticated;