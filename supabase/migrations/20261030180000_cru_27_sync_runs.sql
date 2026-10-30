-- CRU-27: one row per nightly sync run, so a failed or missed run is visible
-- without digging through function logs, and the run history is evidence the
-- schedule fires unattended (CRU-12).
--
-- A row is inserted when a run starts and completed when it ends; a row with
-- no finished_at is a run that died part-way (for example a function timeout).
-- No student identity is stored: failures name the calendar_sources row and
-- its sync status only.

CREATE TABLE IF NOT EXISTS public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  total integer NOT NULL DEFAULT 0 CHECK (total >= 0),
  ok integer NOT NULL DEFAULT 0 CHECK (ok >= 0),
  failed integer NOT NULL DEFAULT 0 CHECK (failed >= 0),
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms integer CHECK (duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS sync_runs_started_at_idx ON public.sync_runs (started_at DESC);

-- Written and read only by the server (service role) and the dashboard.
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sync_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sync_runs TO service_role;
