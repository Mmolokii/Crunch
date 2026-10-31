DROP POLICY IF EXISTS "Users can create their own row" ON public.users;

REVOKE INSERT ON public.users FROM authenticated;

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
  _clean_role text;
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

  _clean_role := lower(coalesce(_role, 'student'));
  IF _clean_role NOT IN ('student', 'lecturer') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  INSERT INTO public.users (id, email, role, school)
  VALUES (_uid, lower(_email), _clean_role, nullif(btrim(coalesce(_school, '')), ''));

  RETURN _clean_role;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_signup(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_signup(text, text) TO authenticated;