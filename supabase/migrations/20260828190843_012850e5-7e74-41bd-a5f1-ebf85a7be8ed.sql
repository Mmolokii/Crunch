-- 1. Courses the signed-in lecturer owns, grouped by course code. No student identities.
CREATE OR REPLACE FUNCTION public.lecturer_courses()
RETURNS TABLE (code text, name text, student_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(c.code, '—') AS code,
         MIN(c.name) AS name,
         COUNT(DISTINCT c.user_id)::int AS student_count
  FROM public.courses c
  WHERE c.lecturer_id = auth.uid()
    AND auth.uid() IS NOT NULL
  GROUP BY COALESCE(c.code, '—')
  ORDER BY 1;
$$;

-- 2. Due dates on the lecturer's own courses, de-duplicated across student course rows.
CREATE OR REPLACE FUNCTION public.lecturer_due_dates(_code text)
RETURNS TABLE (
  id uuid,
  course_id uuid,
  title text,
  type text,
  due_at timestamptz,
  estimated_hours numeric,
  is_high_stakes boolean,
  source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (e.title, e.due_at, e.source)
         e.id, e.course_id, e.title, e.type, e.due_at,
         e.estimated_hours, e.is_high_stakes, e.source
  FROM public.events e
  JOIN public.courses c ON c.id = e.course_id
  WHERE auth.uid() IS NOT NULL
    AND c.lecturer_id = auth.uid()
    AND COALESCE(c.code, '—') = _code
  ORDER BY e.title, e.due_at, e.source, e.id;
$$;

-- 3. Aggregate cohort workload. Returns zero rows below the minimum cohort size.
CREATE OR REPLACE FUNCTION public.lecturer_cohort_weeks(_code text, _min_cohort integer DEFAULT 8)
RETURNS TABLE (week_start date, avg_hours numeric, student_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    AND (SELECT n FROM sized) >= GREATEST(COALESCE(_min_cohort, 8), 1)
  GROUP BY p.week_start
  ORDER BY p.week_start;
$$;

REVOKE ALL ON FUNCTION public.lecturer_courses() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lecturer_due_dates(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lecturer_cohort_weeks(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lecturer_courses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecturer_due_dates(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecturer_cohort_weeks(text, integer) TO authenticated;