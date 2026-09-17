


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."complete_signup"("_role" "text" DEFAULT 'student'::"text", "_school" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."complete_signup"("_role" "text", "_school" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lecturer_cohort_weeks"("_code" "text", "_min_cohort" integer DEFAULT 8) RETURNS TABLE("week_start" "date", "avg_hours" numeric, "student_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH cohort AS (
    SELECT DISTINCT c.user_id
    FROM public.courses c
    WHERE c.lecturer_id = auth.uid()
      AND COALESCE(c.code, '—') = _code
      AND c.user_id IS NOT NULL
  ),
  sized AS (
    SELECT COUNT(*)::int AS n FROM cohort
  ),
  per_student_week AS (
    SELECT c.user_id,
           date_trunc('week', e.due_at)::date AS week_start,
           SUM(COALESCE(e.actual_hours_logged, e.estimated_hours, 0)) AS hours
    FROM public.events e
    JOIN public.courses c ON c.id = e.course_id
    WHERE c.user_id IN (SELECT user_id FROM cohort)
    GROUP BY c.user_id, 2
  )
  SELECT p.week_start,
         ROUND(SUM(p.hours) / GREATEST((SELECT n FROM sized), 1), 1) AS avg_hours,
         (SELECT n FROM sized) AS student_count
  FROM per_student_week p
  WHERE auth.uid() IS NOT NULL
    AND (SELECT n FROM sized) >= GREATEST(COALESCE(_min_cohort, 8), 1)
  GROUP BY p.week_start
  ORDER BY p.week_start;
$$;


ALTER FUNCTION "public"."lecturer_cohort_weeks"("_code" "text", "_min_cohort" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lecturer_courses"() RETURNS TABLE("code" "text", "name" "text", "student_count" integer, "course_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(c.code, '—') AS code,
         MIN(c.name) AS name,
         COUNT(DISTINCT c.user_id)::int AS student_count,
         MIN(c.id::text)::uuid AS course_id
  FROM public.courses c
  WHERE c.lecturer_id = auth.uid()
    AND auth.uid() IS NOT NULL
  GROUP BY COALESCE(c.code, '—')
  ORDER BY 1;
$$;


ALTER FUNCTION "public"."lecturer_courses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lecturer_delete_due_date"("_event_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _code text;
  _school text;
  _uid text;
  _count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT e.external_uid, COALESCE(c.code, '—'), u.school
    INTO _uid, _code, _school
  FROM public.events e
  JOIN public.courses c ON c.id = e.course_id
  LEFT JOIN public.users u ON u.id = c.user_id
  WHERE e.id = _event_id
    AND e.source = 'manual'
    AND c.lecturer_id = auth.uid();

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Due date not found or not manually created';
  END IF;

  DELETE FROM public.events e
  USING public.courses c
  LEFT JOIN public.users u ON u.id = c.user_id
  WHERE c.id = e.course_id
    AND e.external_uid = _uid
    AND e.source = 'manual'
    AND COALESCE(c.code, '—') = _code
    AND u.school IS NOT DISTINCT FROM _school
    AND c.lecturer_id = auth.uid();

  GET DIAGNOSTICS _count = ROW_COUNT;
  IF _count = 0 THEN
    RAISE EXCEPTION 'Due date not found or not manually created';
  END IF;
END;
$$;


ALTER FUNCTION "public"."lecturer_delete_due_date"("_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lecturer_due_dates"("_code" "text") RETURNS TABLE("id" "uuid", "course_id" "uuid", "title" "text", "type" "text", "due_at" timestamp with time zone, "estimated_hours" numeric, "is_high_stakes" boolean, "source" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT DISTINCT ON (e.title, e.due_at, e.source)
         e.id, e.course_id, e.title, e.type, e.due_at,
         e.estimated_hours, e.is_high_stakes, e.source
  FROM public.events e
  JOIN public.courses c ON c.id = e.course_id
  WHERE auth.uid() IS NOT NULL
    AND c.lecturer_id = auth.uid()
    AND COALESCE(c.code, '—') = _code
  ORDER BY e.title, e.due_at, e.source, e.id;
$$;


ALTER FUNCTION "public"."lecturer_due_dates"("_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lecturer_upsert_due_date"("_course_id" "uuid", "_title" "text", "_due_at" timestamp with time zone, "_type" "text" DEFAULT 'other'::"text", "_estimated_hours" numeric DEFAULT 2, "_is_high_stakes" boolean DEFAULT false, "_event_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _code text;
  _school text;
  _anchor boolean;
  _uid text;
  _first uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _title IS NULL OR btrim(_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF _due_at IS NULL THEN
    RAISE EXCEPTION 'Due date is required';
  END IF;

  IF _estimated_hours IS NULL OR _estimated_hours < 0 OR _estimated_hours > 200 THEN
    RAISE EXCEPTION 'Estimated hours must be between 0 and 200';
  END IF;

  IF COALESCE(_type, 'other') NOT IN ('problem_set', 'essay', 'exam', 'quiz', 'reading', 'other') THEN
    RAISE EXCEPTION 'Invalid event type: %', _type;
  END IF;

  -- identify the (code, school) group of the referenced course row
  SELECT COALESCE(c.code, '—'), u.school
    INTO _code, _school
  FROM public.courses c
  LEFT JOIN public.users u ON u.id = c.user_id
  WHERE c.id = _course_id;

  IF _code IS NULL THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  -- anchor check: at least one row in the group must already belong to the caller
  SELECT EXISTS (
    SELECT 1
    FROM public.courses c
    LEFT JOIN public.users u ON u.id = c.user_id
    WHERE COALESCE(c.code, '—') = _code
      AND u.school IS NOT DISTINCT FROM _school
      AND c.lecturer_id = auth.uid()
  ) INTO _anchor;

  IF NOT _anchor THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  -- opportunistic backfill for late-joining students in the same group
  UPDATE public.courses c
  SET lecturer_id = auth.uid()
  FROM public.users u
  WHERE u.id = c.user_id
    AND COALESCE(c.code, '—') = _code
    AND u.school IS NOT DISTINCT FROM _school
    AND c.lecturer_id IS NULL;

  IF _event_id IS NULL THEN
    _uid := 'manual:' || gen_random_uuid()::text;
  ELSE
    SELECT e.external_uid INTO _uid
    FROM public.events e
    JOIN public.courses c ON c.id = e.course_id
    LEFT JOIN public.users u ON u.id = c.user_id
    WHERE e.id = _event_id
      AND e.source = 'manual'
      AND COALESCE(c.code, '—') = _code
      AND u.school IS NOT DISTINCT FROM _school
      AND c.lecturer_id = auth.uid();

    IF _uid IS NULL THEN
      RAISE EXCEPTION 'Due date not found or not manually created';
    END IF;

    -- edit every fanned-out copy; source guard is a SQL condition
    UPDATE public.events e
    SET title = _title,
        type = COALESCE(_type, 'other'),
        due_at = _due_at,
        estimated_hours = _estimated_hours,
        is_high_stakes = COALESCE(_is_high_stakes, false)
    FROM public.courses c
    LEFT JOIN public.users u ON u.id = c.user_id
    WHERE c.id = e.course_id
      AND e.external_uid = _uid
      AND e.source = 'manual'
      AND COALESCE(c.code, '—') = _code
      AND u.school IS NOT DISTINCT FROM _school
      AND c.lecturer_id = auth.uid();
  END IF;

  -- insert into every group row that does not yet carry this uid
  INSERT INTO public.events (
    course_id, external_uid, title, type, due_at,
    estimated_hours, is_high_stakes, source
  )
  SELECT c.id, _uid, _title, COALESCE(_type, 'other'), _due_at,
         _estimated_hours, COALESCE(_is_high_stakes, false), 'manual'
  FROM public.courses c
  LEFT JOIN public.users u ON u.id = c.user_id
  WHERE COALESCE(c.code, '—') = _code
    AND u.school IS NOT DISTINCT FROM _school
    AND c.lecturer_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.course_id = c.id AND e.external_uid = _uid
    );

  SELECT e.id INTO _first
  FROM public.events e
  JOIN public.courses c ON c.id = e.course_id
  WHERE e.external_uid = _uid
    AND e.source = 'manual'
    AND c.lecturer_id = auth.uid()
  ORDER BY e.id
  LIMIT 1;

  IF _first IS NULL THEN
    RAISE EXCEPTION 'Due date could not be saved';
  END IF;

  RETURN _first;
END;
$$;


ALTER FUNCTION "public"."lecturer_upsert_due_date"("_course_id" "uuid", "_title" "text", "_due_at" timestamp with time zone, "_type" "text", "_estimated_hours" numeric, "_is_high_stakes" boolean, "_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_actual_hours"("_event_id" "uuid", "_hours" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  SET actual_hours_logged = _hours,
      -- first log marks completion; later corrections must NOT move this timestamp
      completed_at = COALESCE(completed_at, now())
  WHERE id = _event_id;
END;
$$;


ALTER FUNCTION "public"."log_actual_hours"("_event_id" "uuid", "_hours" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."calendar_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "ics_url_encrypted" "text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."calendar_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "code" "text",
    "color" "text" DEFAULT '#5B5FEF'::"text",
    "lecturer_id" "uuid"
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid",
    "external_uid" "text" NOT NULL,
    "title" "text" NOT NULL,
    "type" "text" DEFAULT 'other'::"text" NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "estimated_hours" numeric DEFAULT 2,
    "is_high_stakes" boolean DEFAULT false,
    "actual_hours_logged" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "source" "text" DEFAULT 'ics_sync'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "events_source_check" CHECK (("source" = ANY (ARRAY['ics_sync'::"text", 'manual'::"text"]))),
    CONSTRAINT "events_type_check" CHECK (("type" = ANY (ARRAY['problem_set'::"text", 'essay'::"text", 'exam'::"text", 'quiz'::"text", 'reading'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "heavy_week" boolean DEFAULT true NOT NULL,
    "conflict" boolean DEFAULT true NOT NULL,
    "log_hours" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "school" "text",
    "role" "text" DEFAULT 'student'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'lecturer'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."week_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "week_start_date" "date" NOT NULL,
    "total_hours" numeric NOT NULL,
    "level" "text",
    "computed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "week_scores_level_check" CHECK (("level" = ANY (ARRAY['Light'::"text", 'Moderate'::"text", 'Heavy'::"text", 'Brutal'::"text"])))
);


ALTER TABLE "public"."week_scores" OWNER TO "postgres";


ALTER TABLE ONLY "public"."calendar_sources"
    ADD CONSTRAINT "calendar_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_sources"
    ADD CONSTRAINT "calendar_sources_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_user_id_code_key" UNIQUE ("user_id", "code");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_course_id_external_uid_key" UNIQUE ("course_id", "external_uid");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."week_scores"
    ADD CONSTRAINT "week_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."week_scores"
    ADD CONSTRAINT "week_scores_user_id_week_start_date_key" UNIQUE ("user_id", "week_start_date");



CREATE INDEX "courses_lecturer_id_idx" ON "public"."courses" USING "btree" ("lecturer_id");



CREATE INDEX "events_source_idx" ON "public"."events" USING "btree" ("source");



ALTER TABLE ONLY "public"."calendar_sources"
    ADD CONSTRAINT "calendar_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_auth_users_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."week_scores"
    ADD CONSTRAINT "week_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



DROP POLICY IF EXISTS "Users can create their own calendar source" ON "public"."calendar_sources";
CREATE POLICY "Users can create their own calendar source" ON "public"."calendar_sources" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



DROP POLICY IF EXISTS "Users can create their own notification preferences" ON "public"."notification_preferences";
CREATE POLICY "Users can create their own notification preferences" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



DROP POLICY IF EXISTS "Users can read events for their own courses" ON "public"."events";
CREATE POLICY "Users can read events for their own courses" ON "public"."events" FOR SELECT TO "authenticated" USING (("course_id" IN ( SELECT "c"."id"
   FROM "public"."courses" "c"
  WHERE ("c"."user_id" = "auth"."uid"()))));



DROP POLICY IF EXISTS "Users can read their own calendar sources" ON "public"."calendar_sources";
CREATE POLICY "Users can read their own calendar sources" ON "public"."calendar_sources" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



DROP POLICY IF EXISTS "Users can read their own courses" ON "public"."courses";
CREATE POLICY "Users can read their own courses" ON "public"."courses" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



DROP POLICY IF EXISTS "Users can read their own notification preferences" ON "public"."notification_preferences";
CREATE POLICY "Users can read their own notification preferences" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



DROP POLICY IF EXISTS "Users can read their own row" ON "public"."users";
CREATE POLICY "Users can read their own row" ON "public"."users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



DROP POLICY IF EXISTS "Users can read their own week scores" ON "public"."week_scores";
CREATE POLICY "Users can read their own week scores" ON "public"."week_scores" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



DROP POLICY IF EXISTS "Users can update their own calendar source" ON "public"."calendar_sources";
CREATE POLICY "Users can update their own calendar source" ON "public"."calendar_sources" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



DROP POLICY IF EXISTS "Users can update their own notification preferences" ON "public"."notification_preferences";
CREATE POLICY "Users can update their own notification preferences" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."calendar_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."week_scores" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_signup"("_role" "text", "_school" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_signup"("_role" "text", "_school" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_signup"("_role" "text", "_school" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lecturer_cohort_weeks"("_code" "text", "_min_cohort" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lecturer_cohort_weeks"("_code" "text", "_min_cohort" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lecturer_cohort_weeks"("_code" "text", "_min_cohort" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."lecturer_courses"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lecturer_courses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lecturer_courses"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lecturer_delete_due_date"("_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lecturer_delete_due_date"("_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lecturer_delete_due_date"("_event_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lecturer_due_dates"("_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lecturer_due_dates"("_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lecturer_due_dates"("_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lecturer_upsert_due_date"("_course_id" "uuid", "_title" "text", "_due_at" timestamp with time zone, "_type" "text", "_estimated_hours" numeric, "_is_high_stakes" boolean, "_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lecturer_upsert_due_date"("_course_id" "uuid", "_title" "text", "_due_at" timestamp with time zone, "_type" "text", "_estimated_hours" numeric, "_is_high_stakes" boolean, "_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lecturer_upsert_due_date"("_course_id" "uuid", "_title" "text", "_due_at" timestamp with time zone, "_type" "text", "_estimated_hours" numeric, "_is_high_stakes" boolean, "_event_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_actual_hours"("_event_id" "uuid", "_hours" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_actual_hours"("_event_id" "uuid", "_hours" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_actual_hours"("_event_id" "uuid", "_hours" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT MAINTAIN ON TABLE "public"."calendar_sources" TO "anon";
GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."calendar_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_sources" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."courses" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."events" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."users" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."week_scores" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."week_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."week_scores" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







