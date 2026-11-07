-- CRU-72: record what lecturers change, so a wrong or disputed due date can be
-- traced. One row per add, edit or delete, written by the function that makes
-- the change, in the same transaction: a refused or failed change leaves no row.
--
-- A due date fans out to one events row per student; the log holds one row per
-- action and only how many copies it touched, never which students. lecturer_id
-- has no foreign key, so the record outlives the lecturer's account as an id
-- that no longer resolves to anyone. Nobody reads it through the app: only the
-- service role and the dashboard. How long it's kept is CRU-38's decision.
--
-- The two functions below are the baseline's, plus the log.

CREATE TABLE public.lecturer_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  lecturer_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('due_date_added', 'due_date_edited', 'due_date_deleted')),
  course_code text NOT NULL,
  school text,
  event_uid text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  copies integer NOT NULL CHECK (copies >= 0)
);

CREATE INDEX lecturer_audit_log_at_idx ON public.lecturer_audit_log (at DESC);

ALTER TABLE public.lecturer_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lecturer_audit_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.lecturer_audit_log TO service_role;

CREATE OR REPLACE FUNCTION "public"."lecturer_upsert_due_date"("_course_id" "uuid", "_title" "text", "_due_at" timestamp with time zone, "_type" "text" DEFAULT 'other'::"text", "_estimated_hours" numeric DEFAULT 2, "_is_high_stakes" boolean DEFAULT false, "_event_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _code text;
  _school text;
  _anchor boolean;
  _uid text;
  _first uuid;
  _previous jsonb;
  _copies int;
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
    SELECT e.external_uid, jsonb_build_object(
    'title', e.title, 'type', e.type, 'due_at', e.due_at,
    'estimated_hours', e.estimated_hours, 'is_high_stakes', e.is_high_stakes
  )
      INTO _uid, _previous
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

  SELECT count(*) INTO _copies
  FROM public.events e
  JOIN public.courses c ON c.id = e.course_id
  WHERE e.external_uid = _uid
    AND e.source = 'manual'
    AND c.lecturer_id = auth.uid();

  INSERT INTO public.lecturer_audit_log (
    lecturer_id, action, course_code, school, event_uid, old_values, new_values, copies
  )
  VALUES (
    auth.uid(),
    CASE WHEN _event_id IS NULL THEN 'due_date_added' ELSE 'due_date_edited' END,
    _code, _school, _uid, _previous,
    jsonb_build_object(
      'title', _title, 'type', COALESCE(_type, 'other'), 'due_at', _due_at,
      'estimated_hours', _estimated_hours, 'is_high_stakes', COALESCE(_is_high_stakes, false)
    ),
    _copies
  );

  RETURN _first;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."lecturer_delete_due_date"("_event_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _code text;
  _school text;
  _uid text;
  _count int;
  _previous jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT e.external_uid, COALESCE(c.code, '—'), u.school, jsonb_build_object(
    'title', e.title, 'type', e.type, 'due_at', e.due_at,
    'estimated_hours', e.estimated_hours, 'is_high_stakes', e.is_high_stakes
  )
    INTO _uid, _code, _school, _previous
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

  INSERT INTO public.lecturer_audit_log (
    lecturer_id, action, course_code, school, event_uid, old_values, copies
  )
  VALUES (auth.uid(), 'due_date_deleted', _code, _school, _uid, _previous, _count);
END;
$$;
