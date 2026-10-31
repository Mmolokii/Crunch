-- 1. Close the anon write gap on all five tables
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.users FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.calendar_sources FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.courses FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.week_scores FROM anon;
REVOKE SELECT ON public.users, public.calendar_sources, public.courses, public.events, public.week_scores FROM anon;

-- Trim authenticated down to what policies actually allow
REVOKE TRUNCATE, REFERENCES, TRIGGER, DELETE ON public.users FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, DELETE ON public.calendar_sources FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, DELETE, INSERT, UPDATE ON public.courses FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, DELETE, INSERT, UPDATE ON public.events FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, DELETE, INSERT, UPDATE ON public.week_scores FROM authenticated;
REVOKE UPDATE ON public.users FROM authenticated;

GRANT SELECT, INSERT ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.calendar_sources TO authenticated;
GRANT SELECT ON public.courses TO authenticated;
GRANT SELECT ON public.events TO authenticated;
GRANT SELECT ON public.week_scores TO authenticated;
GRANT ALL ON public.users, public.calendar_sources, public.courses, public.events, public.week_scores TO service_role;

-- 2. Re-state the existing SELECT policies scoped TO authenticated
DROP POLICY IF EXISTS "Users can read their own row" ON public.users;
CREATE POLICY "Users can read their own row"
  ON public.users FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can read their own calendar sources" ON public.calendar_sources;
CREATE POLICY "Users can read their own calendar sources"
  ON public.calendar_sources FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read their own courses" ON public.courses;
CREATE POLICY "Users can read their own courses"
  ON public.courses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read events for their own courses" ON public.events;
CREATE POLICY "Users can read events for their own courses"
  ON public.events FOR SELECT TO authenticated
  USING (course_id IN (SELECT c.id FROM public.courses c WHERE c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can read their own week scores" ON public.week_scores;
CREATE POLICY "Users can read their own week scores"
  ON public.week_scores FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. Signup row: INSERT only, no UPDATE (role stays non-client-writable)
CREATE POLICY "Users can create their own row"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- 4. Calendar source: own row insert/update
CREATE POLICY "Users can create their own calendar source"
  ON public.calendar_sources FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calendar source"
  ON public.calendar_sources FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Hours logging via SECURITY DEFINER, ownership-checked, single column
CREATE OR REPLACE FUNCTION public.log_actual_hours(_event_id uuid, _hours numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SET actual_hours_logged = _hours
  WHERE id = _event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_actual_hours(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_actual_hours(uuid, numeric) TO authenticated;

-- 6. Tie profile rows to the auth account
ALTER TABLE public.users
  ADD CONSTRAINT users_id_auth_users_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;