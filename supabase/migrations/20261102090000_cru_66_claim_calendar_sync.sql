-- CRU-66: the limit on student-triggered syncs moves into Postgres and also
-- counts failures.
--
-- The cooldown was read in the server function and only counted successful
-- syncs, so failed or empty syncs could repeat without limit (each one an
-- outbound request of up to 15 seconds), and requests sent together all
-- passed. A claim is now one atomic statement: of any number of concurrent
-- calls, one wins. A new attempt needs 30 seconds since the last attempt and
-- 2 minutes since the last successful sync. The nightly run doesn't claim.
--
-- A new link is stored only by a winning claim, so a refused request changes
-- nothing. Returns no row when there's no calendar and no new link; otherwise
-- the source, with retry_in_seconds = 0 if this call won.

ALTER TABLE public.calendar_sources
  ADD COLUMN IF NOT EXISTS last_sync_attempt_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_calendar_sync(
  _user_id uuid,
  _new_ics_url_encrypted text DEFAULT NULL
)
RETURNS TABLE(source_id uuid, retry_in_seconds integer)
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  _attempt_gap CONSTANT interval := interval '30 seconds';
  _success_gap CONSTANT interval := interval '120 seconds';
  _id uuid;
  _attempted timestamptz;
  _synced timestamptz;
BEGIN
  IF _new_ics_url_encrypted IS NOT NULL THEN
    INSERT INTO public.calendar_sources (user_id, ics_url_encrypted, last_sync_attempt_at)
    VALUES (_user_id, _new_ics_url_encrypted, now())
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO _id;

    IF _id IS NOT NULL THEN
      RETURN QUERY SELECT _id, 0;
      RETURN;
    END IF;
  END IF;

  UPDATE public.calendar_sources cs
  SET last_sync_attempt_at = now(),
      ics_url_encrypted = COALESCE(_new_ics_url_encrypted, cs.ics_url_encrypted)
  WHERE cs.user_id = _user_id
    AND (cs.last_sync_attempt_at IS NULL OR cs.last_sync_attempt_at <= now() - _attempt_gap)
    AND (cs.last_synced_at IS NULL OR cs.last_synced_at <= now() - _success_gap)
  RETURNING cs.id INTO _id;

  IF _id IS NOT NULL THEN
    RETURN QUERY SELECT _id, 0;
    RETURN;
  END IF;

  SELECT cs.id, cs.last_sync_attempt_at, cs.last_synced_at
    INTO _id, _attempted, _synced
  FROM public.calendar_sources cs
  WHERE cs.user_id = _user_id;

  IF _id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT _id, LEAST(
    120,
    GREATEST(
      1,
      ceil(extract(epoch FROM GREATEST(
        COALESCE(_attempted + _attempt_gap, now()),
        COALESCE(_synced + _success_gap, now())
      ) - now()))::integer
    )
  );
END;
$$;

-- Only the server calls this, with the user id from the verified session.
REVOKE ALL ON FUNCTION public.claim_calendar_sync(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_calendar_sync(uuid, text) TO service_role;
