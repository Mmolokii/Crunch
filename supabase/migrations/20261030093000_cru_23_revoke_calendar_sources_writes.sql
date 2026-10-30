-- CRU-23: students can no longer write calendar_sources directly through the
-- API. The saveCalendarSource server function is the only write path; it
-- validates the URL against the feed allow-list, encrypts it, and writes with
-- the service role using the user id from the verified session.
-- Reads are unchanged (RLS still limits each student to their own row).
REVOKE INSERT, UPDATE ON public.calendar_sources FROM authenticated;
