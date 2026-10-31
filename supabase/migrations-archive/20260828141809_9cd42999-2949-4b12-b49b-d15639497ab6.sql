-- 1. completed_at
ALTER TABLE public.events
  ADD COLUMN completed_at timestamptz;

-- 2. log_actual_hours: also mark complete, but never move an existing timestamp
CREATE OR REPLACE FUNCTION public.log_actual_hours(_event_id uuid, _hours numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _hours IS NULL OR _hours < 0 OR _hours > 200 THEN
    RAISE EXCEPTION 'Hours must be between 0 and 200';
  END IF;

  SELECT c.user_id INTO _owner
  FROM public.events e
  JOIN public.courses c ON c.id = e.course_id
  WHERE e.id = _event_id;

  IF _owner IS NULL OR _owner <> auth.uid() THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  UPDATE public.events
  SET actual_hours_logged = _hours,
      -- first log marks completion; later corrections must NOT move this timestamp
      completed_at = COALESCE(completed_at, now())
  WHERE id = _event_id;
END;
$function$;

-- 3. lecturer upsert
CREATE OR REPLACE FUNCTION public.lecturer_upsert_due_date(
  _course_id uuid,
  _title text,
  _due_at timestamptz,
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
  _lecturer uuid;
  _result_id uuid;
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

  SELECT c.lecturer_id INTO _lecturer
  FROM public.courses c
  WHERE c.id = _course_id;

  IF _lecturer IS NULL OR _lecturer <> auth.uid() THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  IF _event_id IS NULL THEN
    -- external_uid is NOT NULL with no default: generate a namespaced synthetic id
    INSERT INTO public.events (
      course_id, external_uid, title, type, due_at,
      estimated_hours, is_high_stakes, source
    )
    VALUES (
      _course_id,
      'manual:' || gen_random_uuid()::text,
      _title, COALESCE(_type, 'other'), _due_at,
      _estimated_hours, COALESCE(_is_high_stakes, false), 'manual'
    )
    RETURNING id INTO _result_id;
  ELSE
    UPDATE public.events
    SET title = _title,
        type = COALESCE(_type, 'other'),
        due_at = _due_at,
        estimated_hours = _estimated_hours,
        is_high_stakes = COALESCE(_is_high_stakes, false)
    WHERE id = _event_id
      AND course_id = _course_id
      AND source = 'manual'   -- SQL-level guard: an ics_sync row can never match
    RETURNING id INTO _result_id;

    IF _result_id IS NULL THEN
      RAISE EXCEPTION 'Due date not found or not manually created';
    END IF;
  END IF;

  RETURN _result_id;
END;
$function$;

-- 4. lecturer delete
CREATE OR REPLACE FUNCTION public.lecturer_delete_due_date(_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _deleted uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.events e
  USING public.courses c
  WHERE e.id = _event_id
    AND c.id = e.course_id
    AND c.lecturer_id = auth.uid()   -- gate resolved against this event's own course
    AND e.source = 'manual'          -- SQL-level guard: an ics_sync row can never match
  RETURNING e.id INTO _deleted;

  IF _deleted IS NULL THEN
    RAISE EXCEPTION 'Due date not found or not manually created';
  END IF;
END;
$function$;

-- 5. execute grants: authenticated only
REVOKE ALL ON FUNCTION public.lecturer_upsert_due_date(uuid, text, timestamptz, text, numeric, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lecturer_delete_due_date(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lecturer_upsert_due_date(uuid, text, timestamptz, text, numeric, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lecturer_delete_due_date(uuid) TO authenticated;