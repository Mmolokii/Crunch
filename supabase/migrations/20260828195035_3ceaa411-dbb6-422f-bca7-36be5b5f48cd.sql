-- 1. Normalise existing event types to the canonical six, then constrain.
UPDATE public.events SET type = 'problem_set' WHERE type IN ('assignment', 'homework');
UPDATE public.events SET type = 'other'
  WHERE type IS NULL OR type NOT IN ('problem_set', 'essay', 'exam', 'quiz', 'reading', 'other');

ALTER TABLE public.events
  ADD CONSTRAINT events_type_check
  CHECK (type IN ('problem_set', 'essay', 'exam', 'quiz', 'reading', 'other'));

-- 2. Fan-out upsert: anchor-verified, applies to every student row sharing (code, school).
CREATE OR REPLACE FUNCTION public.lecturer_upsert_due_date(
  _course_id uuid,
  _title text,
  _due_at timestamp with time zone,
  _type text DEFAULT 'other',
  _estimated_hours numeric DEFAULT 2,
  _is_high_stakes boolean DEFAULT false,
  _event_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _code text;
  _school text;
  _anchor boolean;
  _uid text;
  _first uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _title IS NULL OR btrim(_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF _due_at IS NULL THEN
    RAISE EXCEPTION 'Due date is required';
  END IF;

  IF _estimated_hours IS NULL OR _estimated_hours < 0 OR _estimated_hours > 200 THEN
    RAISE EXCEPTION 'Estimated hours must be between 0 and 200';
  END IF;

  IF COALESCE(_type, 'other') NOT IN ('problem_set', 'essay', 'exam', 'quiz', 'reading', 'other') THEN
    RAISE EXCEPTION 'Invalid event type: %', _type;
  END IF;

  -- identify the (code, school) group of the referenced course row
  SELECT COALESCE(c.code, '—'), u.school
    INTO _code, _school
  FROM public.courses c
  LEFT JOIN public.users u ON u.id = c.user_id
  WHERE c.id = _course_id;

  IF _code IS NULL THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  -- anchor check: at least one row in the group must already belong to the caller
  SELECT EXISTS (
    SELECT 1
    FROM public.courses c
    LEFT JOIN public.users u ON u.id = c.user_id
    WHERE COALESCE(c.code, '—') = _code
      AND u.school IS NOT DISTINCT FROM _school
      AND c.lecturer_id = auth.uid()
  ) INTO _anchor;

  IF NOT _anchor THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  -- opportunistic backfill for late-joining students in the same group
  UPDATE public.courses c
  SET lecturer_id = auth.uid()
  FROM public.users u
  WHERE u.id = c.user_id
    AND COALESCE(c.code, '—') = _code
    AND u.school IS NOT DISTINCT FROM _school
    AND c.lecturer_id IS NULL;

  IF _event_id IS NULL THEN
    _uid := 'manual:' || gen_random_uuid()::text;
  ELSE
    SELECT e.external_uid INTO _uid
    FROM public.events e
    JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.users u ON u.id = c.user_id
    WHERE e.id = _event_id
      AND e.source = 'manual'
      AND COALESCE(c.code, '—') = _code
      AND u.school IS NOT DISTINCT FROM _school
      AND c.lecturer_id = auth.uid();

    IF _uid IS NULL THEN
      RAISE EXCEPTION 'Due date not found or not manually created';
    END IF;

    -- edit every fanned-out copy; source guard is a SQL condition
    UPDATE public.events e
    SET title = _title,
        type = COALESCE(_type, 'other'),
        due_at = _due_at,
        estimated_hours = _estimated_hours,
        is_high_stakes = COALESCE(_is_high_stakes, false)
    FROM public.courses c
    LEFT JOIN public.users u ON u.id = c.user_id
    WHERE c.id = e.course_id
      AND e.external_uid = _uid
      AND e.source = 'manual'
      AND COALESCE(c.code, '—') = _code
      AND u.school IS NOT DISTINCT FROM _school
      AND c.lecturer_id = auth.uid();
  END IF;

  -- insert into every group row that does not yet carry this uid
  INSERT INTO public.events (
    course_id, external_uid, title, type, due_at,
    estimated_hours, is_high_stakes, source
  )
  SELECT c.id, _uid, _title, COALESCE(_type, 'other'), _due_at,
         _estimated_hours, COALESCE(_is_high_stakes, false), 'manual'
  FROM public.courses c
  LEFT JOIN public.users u ON u.id = c.user_id
  WHERE COALESCE(c.code, '—') = _code
    AND u.school IS NOT DISTINCT FROM _school
    AND c.lecturer_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.course_id = c.id AND e.external_uid = _uid
    );

  SELECT e.id INTO _first
  FROM public.events e
  JOIN public.courses c ON c.id = e.course_id
  WHERE e.external_uid = _uid
    AND e.source = 'manual'
    AND c.lecturer_id = auth.uid()
  ORDER BY e.id
  LIMIT 1;

  IF _first IS NULL THEN
    RAISE EXCEPTION 'Due date could not be saved';
  END IF;

  RETURN _first;
END;
$function$;

-- 3. Fan-out delete: removes every copy of a manual due date across the group.
CREATE OR REPLACE FUNCTION public.lecturer_delete_due_date(_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _code text;
  _school text;
  _uid text;
  _count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT e.external_uid, COALESCE(c.code, '—'), u.school
    INTO _uid, _code, _school
  FROM public.events e
  JOIN public.courses c ON c.id = e.course_id
  LEFT JOIN public.users u ON u.id = c.user_id
  WHERE e.id = _event_id
    AND e.source = 'manual'
    AND c.lecturer_id = auth.uid();

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Due date not found or not manually created';
  END IF;

  DELETE FROM public.events e
  USING public.courses c
  LEFT JOIN public.users u ON u.id = c.user_id
  WHERE c.id = e.course_id
    AND e.external_uid = _uid
    AND e.source = 'manual'
    AND COALESCE(c.code, '—') = _code
    AND u.school IS NOT DISTINCT FROM _school
    AND c.lecturer_id = auth.uid();

  GET DIAGNOSTICS _count = ROW_COUNT;
  IF _count = 0 THEN
    RAISE EXCEPTION 'Due date not found or not manually created';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.lecturer_upsert_due_date(uuid, text, timestamp with time zone, text, numeric, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lecturer_delete_due_date(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lecturer_upsert_due_date(uuid, text, timestamp with time zone, text, numeric, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecturer_delete_due_date(uuid) TO authenticated;