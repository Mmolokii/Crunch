-- CRU-25: reject non-university emails inside Supabase Auth itself, before
-- an auth.users row exists or a confirmation email is sent. complete_signup
-- keeps its own domain check as a second layer.
--
-- After applying, enable it in the dashboard:
--   Authentication → Auth Hooks → Before User Created →
--   Postgres function public.hook_require_university_email

CREATE OR REPLACE FUNCTION public.hook_require_university_email(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  _email text := lower(coalesce(event -> 'user' ->> 'email', ''));
BEGIN
  -- exact domain only, same rule as complete_signup: no subdomains
  IF split_part(_email, '@', 2) = 'myemeris.edu.za'
     AND array_length(string_to_array(_email, '@'), 1) = 2 THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Only @myemeris.edu.za email addresses can create a Crunch account.'
    )
  );
END;
$$;

-- Only Supabase Auth may call the hook.
REVOKE ALL ON FUNCTION public.hook_require_university_email(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_require_university_email(jsonb) TO supabase_auth_admin;
