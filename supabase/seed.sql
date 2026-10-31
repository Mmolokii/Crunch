-- Local development seed (CRU-34). Loaded by `bun run db:start` and
-- `bun run db:reset` into a LOCAL database only; Supabase never runs this file
-- against a hosted project. Every person here is fictional.
--
-- Sign-ins (password for all of them: crunch-local):
--   student01@myemeris.edu.za … student10@myemeris.edu.za   students with data
--   lecturer@myemeris.edu.za                                 lecturer for PROG6221 and XISD5319
--   newstudent@myemeris.edu.za                               fresh account: first sign-in runs
--                                                            complete_signup, then onboarding
--
-- Due dates are relative to the current week (Monday, UTC), so the data never
-- goes stale: week 3 has a same-day clash, week 5 is Brutal, and last week
-- has logged hours for Insights. Cohorts: PROG6221 has 10 students (heatmap
-- shows), XISD5319 has 6 (below the minimum of 8, so it stays hidden).
--
-- No calendar_sources rows: there's no real Brightspace feed locally, so
-- students show "Connect calendar". Onboarding only accepts the real host.

DO $seed$
DECLARE
  pw text := extensions.crypt('crunch-local', extensions.gen_salt('bf'));
  w timestamptz := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  lecturer uuid := '00000000-0000-4000-8000-000000000100';
  uid uuid;
  cid uuid;
  i int;
  person record;
BEGIN
  -- Auth accounts. Confirmed, email/password, with the identity row GoTrue
  -- needs for password sign-in.
  FOR person IN
    SELECT ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid AS id,
           'student' || lpad(n::text, 2, '0') || '@myemeris.edu.za' AS email
    FROM generate_series(1, 10) n
    UNION ALL SELECT lecturer, 'lecturer@myemeris.edu.za'
    UNION ALL SELECT '00000000-0000-4000-8000-000000000200', 'newstudent@myemeris.edu.za'
  LOOP
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', person.id, 'authenticated', 'authenticated',
      person.email, pw, now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), person.id, person.id::text, 'email',
      jsonb_build_object('sub', person.id::text, 'email', person.email, 'email_verified', true),
      now(), now(), now()
    );
  END LOOP;

  -- Crunch accounts, as complete_signup would create them. newstudent is
  -- left out on purpose so its first sign-in exercises that path.
  INSERT INTO public.lecturer_allowlist (email, note)
  VALUES ('lecturer@myemeris.edu.za', 'Local seed lecturer');
  INSERT INTO public.users (id, email, role)
  SELECT id, email, CASE WHEN id = lecturer THEN 'lecturer' ELSE 'student' END
  FROM auth.users
  WHERE email <> 'newstudent@myemeris.edu.za';

  -- Courses and due dates, one copy per student, the way the sync writes them.
  FOR i IN 1..10 LOOP
    uid := ('00000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid;

    -- PROG6221: everyone (cohort of 10), lecturer linked.
    INSERT INTO public.courses (user_id, code, name, lecturer_id)
    VALUES (uid, 'PROG6221', 'Programming 2B', lecturer) RETURNING id INTO cid;
    INSERT INTO public.events (course_id, external_uid, source, type, title, due_at, estimated_hours, is_high_stakes, actual_hours_logged, completed_at) VALUES
      (cid, 'seed-prog-ice1', 'ics_sync', 'problem_set', 'ICE Task 1', w - interval '4 days' + interval '21 hours', 3, false,
         CASE WHEN i <= 6 THEN 4.5 END, CASE WHEN i <= 6 THEN w - interval '4 days' + interval '20 hours' END),
      (cid, 'seed-prog-poe1', 'ics_sync', 'essay', 'POE Part 1', w + interval '10 days' + interval '21 hours', 6, true, NULL, NULL),
      (cid, 'seed-prog-quiz', 'ics_sync', 'quiz', 'Quiz 2', w + interval '15 days' + interval '9 hours', 1, false, NULL, NULL),
      (cid, 'seed-prog-test', 'ics_sync', 'exam', 'Class Test 2', w + interval '22 days' + interval '9 hours', 6, true, NULL, NULL),
      (cid, 'seed-prog-poe2', 'ics_sync', 'essay', 'POE Part 2', w + interval '39 days' + interval '21 hours', 10, true, NULL, NULL),
      (cid, 'manual:00000000-0000-4000-8000-00000000a001', 'manual', 'problem_set', 'Lab exercise (lecturer-set)',
         w + interval '17 days' + interval '14 hours', 2, false, NULL, NULL);

    -- ADDB6311: students 1–8. Its exam lands on the same day as Class Test 2.
    IF i <= 8 THEN
      INSERT INTO public.courses (user_id, code, name) VALUES (uid, 'ADDB6311', 'Advanced Databases') RETURNING id INTO cid;
      INSERT INTO public.events (course_id, external_uid, source, type, title, due_at, estimated_hours, is_high_stakes) VALUES
        (cid, 'seed-addb-ps1', 'ics_sync', 'problem_set', 'Practical 3', w + interval '2 days' + interval '21 hours', 3, false),
        (cid, 'seed-addb-exam', 'ics_sync', 'exam', 'Semester Test', w + interval '22 days' + interval '13 hours', 6, true),
        (cid, 'seed-addb-proj', 'ics_sync', 'problem_set', 'Project milestone', w + interval '36 days' + interval '21 hours', 4, false),
        (cid, 'seed-addb-essay', 'ics_sync', 'essay', 'Design report', w + interval '39 days' + interval '12 hours', 6, true);
    END IF;

    -- XISD5319: students 1–6 (below the cohort minimum), lecturer linked.
    IF i <= 6 THEN
      INSERT INTO public.courses (user_id, code, name, lecturer_id) VALUES (uid, 'XISD5319', 'Systems Design', lecturer) RETURNING id INTO cid;
      INSERT INTO public.events (course_id, external_uid, source, type, title, due_at, estimated_hours, is_high_stakes, actual_hours_logged, completed_at) VALUES
        (cid, 'seed-xisd-quiz1', 'ics_sync', 'quiz', 'Quiz 1', w - interval '10 days' + interval '9 hours', 1, false,
           CASE WHEN i <= 3 THEN 0.5 END, CASE WHEN i <= 3 THEN w - interval '10 days' + interval '9 hours' END),
        (cid, 'seed-xisd-read', 'ics_sync', 'reading', 'Chapter 4 reading', w + interval '8 days' + interval '9 hours', 2, false, NULL, NULL),
        (cid, 'seed-xisd-essay', 'ics_sync', 'essay', 'Case study', w + interval '25 days' + interval '21 hours', 5, true, NULL, NULL),
        (cid, 'seed-xisd-quiz2', 'ics_sync', 'quiz', 'Quiz 3', w + interval '35 days' + interval '9 hours', 1, false, NULL, NULL);
    END IF;

    -- WEDE5020: students 1–4.
    IF i <= 4 THEN
      INSERT INTO public.courses (user_id, code, name) VALUES (uid, 'WEDE5020', 'Web Development') RETURNING id INTO cid;
      INSERT INTO public.events (course_id, external_uid, source, type, title, due_at, estimated_hours, is_high_stakes) VALUES
        (cid, 'seed-wede-ps', 'ics_sync', 'problem_set', 'Assignment 2', w + interval '23 days' + interval '21 hours', 3, false),
        (cid, 'seed-wede-essay', 'ics_sync', 'essay', 'Portfolio', w + interval '38 days' + interval '21 hours', 6, true),
        (cid, 'seed-wede-exam', 'ics_sync', 'exam', 'Practical exam', w + interval '50 days' + interval '9 hours', 6, true);
    END IF;

    INSERT INTO public.notification_preferences (user_id, heavy_week, conflict, log_hours)
    VALUES (uid, true, true, i % 2 = 0);
  END LOOP;
END
$seed$;
