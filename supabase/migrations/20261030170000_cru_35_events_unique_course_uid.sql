-- CRU-35: the sync upserts events on (course_id, external_uid). Production
-- already has this unique constraint, but it was added outside the migrations,
-- so a database rebuilt from them (local, staging) would lack it and every
-- sync would fail. This records it; on production it is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'events_course_id_external_uid_key'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_course_id_external_uid_key UNIQUE (course_id, external_uid);
  END IF;
END $$;
