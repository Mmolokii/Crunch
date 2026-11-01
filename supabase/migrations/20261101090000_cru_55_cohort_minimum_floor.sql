-- CRU-55: the minimum cohort of 8 (ADR-0008) is enforced in SQL, not by the
-- caller.
--
-- lecturer_cohort_weeks took the threshold from its _min_cohort argument and
-- only floored it at 1. The app passes LECTURER_MIN_COHORT, but a lecturer can
-- call the RPC directly with their own session and pass _min_cohort => 1,
-- which returns averages for a course of one or two students: one student's
-- hours. The floor is now 8, so _min_cohort (and LECTURER_MIN_COHORT) can
-- raise the threshold but never lower it.
--
-- Same signature, so the existing grants (authenticated, service_role) stay.
-- The only change from the baseline body is the final GREATEST(…, 8).

CREATE OR REPLACE FUNCTION public.lecturer_cohort_weeks(_code text, _min_cohort integer DEFAULT 8)
 RETURNS TABLE(week_start date, avg_hours numeric, student_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH cohort AS (
    SELECT DISTINCT c.user_id
    FROM public.courses c
    WHERE c.lecturer_id = auth.uid()
      AND COALESCE(c.code, '—') = _code
      AND c.user_id IS NOT NULL
  ),
  sized AS (
    SELECT COUNT(*)::int AS n FROM cohort
  ),
  per_student_week AS (
    SELECT c.user_id,
           date_trunc('week', e.due_at)::date AS week_start,
           SUM(COALESCE(e.actual_hours_logged, e.estimated_hours, 0)) AS hours
    FROM public.events e
    JOIN public.courses c ON c.id = e.course_id
    WHERE c.user_id IN (SELECT user_id FROM cohort)
    GROUP BY c.user_id, 2
  )
  SELECT p.week_start,
         ROUND(SUM(p.hours) / GREATEST((SELECT n FROM sized), 1), 1) AS avg_hours,
         (SELECT n FROM sized) AS student_count
  FROM per_student_week p
  WHERE auth.uid() IS NOT NULL
    AND (SELECT n FROM sized) >= GREATEST(COALESCE(_min_cohort, 8), 8)
  GROUP BY p.week_start
  ORDER BY p.week_start;
$function$;
