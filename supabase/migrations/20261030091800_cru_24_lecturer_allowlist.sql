-- CRU-24: the lecturer role is granted by an admin-maintained allow-list,
-- never by the caller. complete_signup keeps its signature so existing
-- clients don't break, but _role is now ignored.

CREATE TABLE IF NOT EXISTS public.lecturer_allowlist (
  email text PRIMARY KEY CHECK (email = lower(email)),
  added_at timestamptz NOT NULL DEFAULT now(),
  note text
);

ALTER TABLE public.lecturer_allowlist ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role (which bypasses RLS) and the
-- SECURITY DEFINER function below ever read this table.
REVOKE ALL ON public.lecturer_allowlist FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lecturer_allowlist TO service_role;

CREATE OR REPLACE FUNCTION public.complete_signup(_role text DEFAULT 'student', _school text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _existing text;
  _granted_role text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT u.role INTO _existing FROM public.users u WHERE u.id = _uid;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  -- email comes from the verified auth record, never from the caller
  SELECT au.email INTO _email FROM auth.users au WHERE au.id = _uid;

  IF _email IS NULL THEN
    RAISE EXCEPTION 'No email on account';
  END IF;

  -- exact domain only; subdomains such as x@sub.myemeris.edu.za are rejected
  IF lower(_email) NOT LIKE '%@myemeris.edu.za'
     OR split_part(lower(_email), '@', 2) <> 'myemeris.edu.za' THEN
    RAISE EXCEPTION 'Only @myemeris.edu.za email addresses are allowed';
  END IF;

  -- role is decided here, never taken from _role
  SELECT CASE WHEN EXISTS (
           SELECT 1 FROM public.lecturer_allowlist la WHERE la.email = lower(_email)
         ) THEN 'lecturer' ELSE 'student' END
    INTO _granted_role;

  INSERT INTO public.users (id, email, role, school)
  VALUES (_uid, lower(_email), _granted_role, nullif(btrim(coalesce(_school, '')), ''));

  RETURN _granted_role;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_signup(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_signup(text, text) TO authenticated;
