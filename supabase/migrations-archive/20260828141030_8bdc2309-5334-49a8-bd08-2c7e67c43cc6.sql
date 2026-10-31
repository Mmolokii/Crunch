ALTER TABLE public.events
  ADD COLUMN source text NOT NULL DEFAULT 'ics_sync';

ALTER TABLE public.events
  ADD CONSTRAINT events_source_check CHECK (source IN ('ics_sync', 'manual'));

UPDATE public.events SET source = 'ics_sync' WHERE source IS NULL OR source NOT IN ('ics_sync', 'manual');

ALTER TABLE public.courses
  ADD COLUMN lecturer_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS courses_lecturer_id_idx ON public.courses (lecturer_id);
CREATE INDEX IF NOT EXISTS events_source_idx ON public.events (source);