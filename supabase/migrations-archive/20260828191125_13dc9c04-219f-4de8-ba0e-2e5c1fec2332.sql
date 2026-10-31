DROP FUNCTION IF EXISTS public.lecturer_courses();

CREATE OR REPLACE FUNCTION public.lecturer_courses()
RETURNS TABLE (code text, name text, student_count integer, course_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(c.code, '—') AS code,
         MIN(c.name) AS name,
         COUNT(DISTINCT c.user_id)::int AS student_count,
         MIN(c.id::text)::uuid AS course_id
  FROM public.courses c
  WHERE c.lecturer_id = auth.uid()
    AND auth.uid() IS NOT NULL
  GROUP BY COALESCE(c.code, '—')
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.lecturer_courses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lecturer_courses() TO authenticated;