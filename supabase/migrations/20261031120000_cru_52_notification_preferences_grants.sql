-- CRU-52: least-privilege grants on notification_preferences.
--
-- The baseline granted ALL on this table to anon and authenticated. RLS still
-- limited every read and write to the student's own row (all policies are
-- TO authenticated and check auth.uid() = user_id), but:
--   * anon has no reason to hold any privilege here;
--   * ALL includes TRUNCATE, REFERENCES and TRIGGER, which RLS doesn't govern
--     (TRUNCATE bypasses it entirely).
-- authenticated keeps exactly what the policies and saveNotificationPrefs'
-- upsert need: SELECT, INSERT, UPDATE. No DELETE policy exists, so no DELETE
-- grant. service_role is unchanged. Safe to re-run.

REVOKE ALL ON TABLE public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_preferences TO authenticated;
