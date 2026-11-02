/**
 * CRU-15 adversarial test matrix — runs the privileged surface (RLS + the
 * SECURITY DEFINER functions in supabase/migrations/) against the real
 * Supabase project as two real student accounts, the way a malicious client
 * would: straight through supabase-js with the anon key, no server functions.
 *
 * Usage:
 *   1. Create a gitignored `.env.test` (already covered by `.env.*`) with:
 *        SUPABASE_URL=...
 *        SUPABASE_PUBLISHABLE_KEY=...        # anon key, never the service role
 *        TEST_STUDENT_A_EMAIL=...@myemeris.edu.za
 *        TEST_STUDENT_A_PASSWORD=...
 *        TEST_STUDENT_B_EMAIL=...@myemeris.edu.za
 *        TEST_STUDENT_B_PASSWORD=...
 *      Student A needs at least one synced course with at least one event.
 *   2. Run:  bun --env-file=.env.test scripts/adversarial-test-matrix.ts
 *      Add --signup-probe to also run check 20 (see its comment first).
 *
 * Locally and in CI (CRU-54): `bun run test:security` runs it with --local
 * against the stack from `bun run db:start` + `bun run db:env`. --local signs
 * in as the seed students (supabase/seed.sql) and refuses any non-local URL,
 * so it can never touch a hosted project. It also runs checks 25–35 as the
 * seed lecturer, whose expectations depend on the seed's courses, and checks
 * 38–43 with the service role.
 *
 * Checks 17–20 cover the CRU-23/24/25 fixes and only pass once those
 * migrations are applied (and, for 20, the auth hook is enabled).
 *
 * Prints PASS/FAIL per check with the evidence (error message or row count)
 * and exits non-zero on any failure.
 *
 * Side effects: checks 4 and 7 log hours on one of student A's own events.
 * The original `actual_hours_logged` is restored afterwards, but there is no
 * way to clear `completed_at`, so the script prefers an event that is already
 * completed and says so when it has to mark a fresh one.
 *
 * Not covered here:
 *   - Lecturer checks against a hosted project: they run only with --local,
 *     where the seed lecturer exists (CRU-17 has no production test lecturer).
 *   - (code, school) fan-out isolation between schools: the seed has one school.
 *   - Subdomain email rejection in complete_signup — needs a throwaway
 *     `x@sub.myemeris.edu.za` signup, which this script won't create.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const local = process.argv.includes("--local");

if (local && (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))) {
  console.error(`--local only runs against the local stack; SUPABASE_URL is ${url ?? "unset"}.`);
  process.exit(1);
}

// The seed accounts (supabase/seed.sql): student01 has completed events.
const SEED_PASSWORD = "crunch-local";
const accounts = local
  ? ({
      A: ["student01@myemeris.edu.za", SEED_PASSWORD],
      B: ["student02@myemeris.edu.za", SEED_PASSWORD],
    } as const)
  : ({
      A: [process.env.TEST_STUDENT_A_EMAIL, process.env.TEST_STUDENT_A_PASSWORD],
      B: [process.env.TEST_STUDENT_B_EMAIL, process.env.TEST_STUDENT_B_PASSWORD],
    } as const);

if (!url || !anonKey || Object.values(accounts).some(([e, p]) => !e || !p)) {
  console.error(
    "Missing env. Need SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_STUDENT_{A,B}_{EMAIL,PASSWORD}.",
  );
  process.exit(1);
}

function newClient() {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(label: keyof typeof accounts) {
  const [email, password] = accounts[label];
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: email!,
    password: password!,
  });
  if (error || !data.user) {
    console.error(`Could not sign in student ${label}: ${error?.message ?? "no user"}`);
    process.exit(1);
  }
  return { client, userId: data.user.id };
}

let failures = 0;
function report(n: number, name: string, pass: boolean, evidence: string) {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${String(n).padStart(2)}. ${name}\n        ${evidence}`);
}

type Result = { data: unknown; error: { message: string } | null };
const describe = ({ data, error }: Result) =>
  error
    ? `error: ${error.message}`
    : `rows: ${Array.isArray(data) ? data.length : JSON.stringify(data)}`;
const isEmpty = ({ data, error }: Result) => !error && Array.isArray(data) && data.length === 0;
const errorIs = ({ error }: Result, message: string) => error?.message === message;
// anon has EXECUTE/SELECT revoked, so PostgREST refuses before the function body runs
const isDenied = ({ error }: Result) => !!error && /permission denied/i.test(error.message);

async function getEvent(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from("events")
    .select("actual_hours_logged, completed_at")
    .eq("id", id)
    .single();
  if (error) throw new Error(`Could not read event ${id}: ${error.message}`);
  return data as { actual_hours_logged: number | null; completed_at: string | null };
}

async function main() {
  const a = await signIn("A");
  const b = await signIn("B");
  const anon = newClient();

  const { data: aCourses, error: courseErr } = await a.client
    .from("courses")
    .select("id, code")
    .eq("user_id", a.userId);
  if (courseErr || !aCourses?.length) {
    console.error(`Student A has no readable courses: ${courseErr?.message ?? "0 rows"}`);
    process.exit(1);
  }
  const { data: aEvents, error: eventErr } = await a.client
    .from("events")
    .select("id, course_id, completed_at")
    .in(
      "course_id",
      aCourses.map((c) => c.id),
    )
    .order("completed_at", { ascending: true, nullsFirst: false });
  if (eventErr || !aEvents?.length) {
    console.error(`Student A has no readable events: ${eventErr?.message ?? "0 rows"}`);
    process.exit(1);
  }
  const target = aEvents[0];
  const targetCourse = aCourses.find((c) => c.id === target.course_id)!;
  const original = await getEvent(a.client, target.id);
  if (!original.completed_at) {
    console.log(
      `Note: none of A's events is completed yet; event ${target.id} will be marked complete.\n`,
    );
  }

  // 1–2. Direct RLS reads across accounts
  let r: Result = await b.client.from("courses").select("id").eq("id", targetCourse.id);
  report(1, "RLS: B reads A's courses row by id → empty", isEmpty(r), describe(r));

  r = await b.client.from("events").select("id").eq("id", target.id);
  report(2, "RLS: B reads A's events row by id → empty", isEmpty(r), describe(r));

  // 3–7. log_actual_hours
  r = await b.client.rpc("log_actual_hours", { _event_id: target.id, _hours: 3 });
  report(
    3,
    "log_actual_hours: B on A's event → 'Event not found'",
    errorIs(r, "Event not found"),
    describe(r),
  );
  const afterB = await getEvent(a.client, target.id);
  if (afterB.actual_hours_logged !== original.actual_hours_logged) {
    report(3, "…and A's hours are unchanged", false, JSON.stringify(afterB));
  }

  r = await a.client.rpc("log_actual_hours", { _event_id: target.id, _hours: 3 });
  const afterA = await getEvent(a.client, target.id);
  report(
    4,
    "log_actual_hours: A on own event → success",
    !r.error && Number(afterA.actual_hours_logged) === 3,
    r.error ? describe(r) : `actual_hours_logged = ${afterA.actual_hours_logged}`,
  );

  for (const [n, hours] of [
    [5, -1],
    [6, 201],
  ] as const) {
    r = await a.client.rpc("log_actual_hours", { _event_id: target.id, _hours: hours });
    report(
      n,
      `log_actual_hours: _hours = ${hours} → rejected`,
      errorIs(r, "Hours must be between 0 and 200"),
      describe(r),
    );
  }

  r = await a.client.rpc("log_actual_hours", { _event_id: target.id, _hours: 4 });
  const afterRelog = await getEvent(a.client, target.id);
  report(
    7,
    "log_actual_hours: re-log doesn't move completed_at",
    !r.error && afterRelog.completed_at === afterA.completed_at && !!afterA.completed_at,
    r.error ? describe(r) : `${afterA.completed_at} → ${afterRelog.completed_at}`,
  );

  // 8–11. Lecturer functions called by a student
  r = await b.client.rpc("lecturer_upsert_due_date", {
    _course_id: targetCourse.id,
    _title: "CRU-15 probe",
    _due_at: new Date().toISOString(),
    _type: "other",
    _estimated_hours: 1,
    _is_high_stakes: false,
  });
  report(
    8,
    "lecturer_upsert_due_date: B on A's course → 'Course not found'",
    errorIs(r, "Course not found"),
    describe(r),
  );

  r = await b.client.rpc("lecturer_delete_due_date", { _event_id: target.id });
  report(
    9,
    "lecturer_delete_due_date: B on A's event → refused",
    errorIs(r, "Due date not found or not manually created"),
    describe(r),
  );

  r = await b.client.rpc("lecturer_courses");
  report(10, "lecturer_courses: student → empty, no error", isEmpty(r), describe(r));

  r = await a.client.rpc("lecturer_cohort_weeks", { _code: targetCourse.code ?? "—" });
  report(
    11,
    `lecturer_cohort_weeks: A on own code (${targetCourse.code}) → empty`,
    isEmpty(r),
    describe(r),
  );

  // 12. No session at all
  r = await anon.rpc("log_actual_hours", { _event_id: target.id, _hours: 3 });
  report(
    12,
    "Unauthenticated: log_actual_hours → refused",
    isDenied(r) || errorIs(r, "Not authenticated"),
    describe(r),
  );
  r = await anon.from("events").select("id").eq("id", target.id);
  report(
    12,
    "Unauthenticated: events read → refused or empty",
    !!r.error || isEmpty(r),
    describe(r),
  );

  // 13. complete_signup idempotency
  const { data: roleRow } = await a.client.from("users").select("role").eq("id", a.userId).single();
  r = await a.client.rpc("complete_signup", { _role: "lecturer" });
  const { count } = await a.client
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("id", a.userId);
  report(
    13,
    "complete_signup again (asking for 'lecturer') → existing role, no duplicate",
    !r.error && r.data === roleRow?.role && count === 1,
    r.error ? describe(r) : `returned '${r.data}', stored '${roleRow?.role}', rows = ${count}`,
  );

  // 14–16. Session boundaries on the remaining per-user tables
  for (const [table, column] of [
    ["users", "id"],
    ["calendar_sources", "user_id"],
    ["week_scores", "user_id"],
    ["notification_preferences", "user_id"],
  ] as const) {
    r = await b.client.from(table).select("*").eq(column, a.userId);
    report(14, `RLS: B reads A's ${table} → empty`, isEmpty(r), describe(r));
  }

  r = await b.client
    .from("calendar_sources")
    .insert({ user_id: a.userId, ics_url_encrypted: "cru-15-probe" })
    .select("id");
  report(
    15,
    "RLS: B inserts a calendar_sources row owned by A → refused",
    !!r.error,
    r.error ? describe(r) : `INSERTED ${JSON.stringify(r.data)} — remove it with the service role`,
  );

  for (const [table, patch] of [
    ["calendar_sources", { last_synced_at: null }],
    ["notification_preferences", { heavy_week: false }],
  ] as const) {
    r = await b.client.from(table).update(patch).eq("user_id", a.userId).select("user_id");
    report(16, `RLS: B updates A's ${table} → 0 rows`, !!r.error || isEmpty(r), describe(r));
  }

  // 17. CRU-23: no direct writes to calendar_sources, even to your own row —
  // saveCalendarSource is the only write path, so its URL check can't be skipped.
  r = await b.client
    .from("calendar_sources")
    .update({ ics_url_encrypted: "https://example.com/d2l/le/calendar/feed/cru-15-probe" })
    .eq("user_id", b.userId)
    .select("id");
  report(
    17,
    "CRU-23: B writes own calendar_sources row directly → refused",
    isDenied(r),
    describe(r),
  );

  // 18–19. CRU-24: the lecturer allow-list is invisible to students, and
  // the test accounts (not allow-listed) hold the student role.
  r = await b.client.from("lecturer_allowlist").select("email");
  report(18, "CRU-24: B reads lecturer_allowlist → refused", !!r.error || isEmpty(r), describe(r));
  for (const [label, who] of [
    ["A", a],
    ["B", b],
  ] as const) {
    const { data: row } = await who.client
      .from("users")
      .select("role")
      .eq("id", who.userId)
      .single();
    report(
      19,
      `CRU-24: ${label}'s stored role is 'student'`,
      row?.role === "student",
      `role = '${row?.role}'`,
    );
  }

  // 20. CRU-25 (opt-in): Supabase Auth itself refuses a non-university email.
  // Opt-in because, if the hook is NOT enabled, this really creates an auth
  // user and sends a confirmation email to the reserved example.com domain.
  // Always on with --local: there's no mail server and the database is disposable.
  if (local || process.argv.includes("--signup-probe")) {
    const { data: signup, error: signupError } = await anon.auth.signUp({
      email: `crunch-probe-${Date.now()}@example.com`,
      password: `probe-${crypto.randomUUID()}`,
    });
    report(
      20,
      "CRU-25: signup with a non-university email → refused by the auth hook",
      !!signupError,
      signupError
        ? `error: ${signupError.message}`
        : `ACCOUNT CREATED (${signup.user?.id}) — enable the hook and delete this user`,
    );
  }

  // 21–24. CRU-54: no direct writes to your OWN rows on tables that are
  // written only by the sync, complete_signup or log_actual_hours. Table
  // grants allow these statements; the missing write policies are what
  // stop them, so a permissive policy added later would show up here.
  // The other patches are no-ops on the row's current values, and the role
  // probe is put back if it lands, so a FAIL against a hosted project leaves
  // nothing changed (an insert that lands says so).
  r = await a.client.from("users").update({ role: "lecturer" }).eq("id", a.userId).select("role");
  const { data: roleAfter } = await a.client
    .from("users")
    .select("role")
    .eq("id", a.userId)
    .single();
  if (roleAfter?.role !== roleRow?.role && roleRow?.role) {
    await a.client.from("users").update({ role: roleRow.role }).eq("id", a.userId);
  }
  report(
    21,
    "CRU-54: A promotes own users row to 'lecturer' → 0 rows",
    (!!r.error || isEmpty(r)) && roleAfter?.role === "student",
    `${describe(r)}; role now '${roleAfter?.role}'`,
  );

  const { data: own } = await a.client.from("events").select("title").eq("id", target.id).single();
  r = await a.client.from("events").update({ title: own?.title }).eq("id", target.id).select("id");
  report(
    22,
    "CRU-54: A updates own events row directly → 0 rows",
    !!r.error || isEmpty(r),
    describe(r),
  );

  r = await a.client
    .from("courses")
    .update({ code: targetCourse.code })
    .eq("id", targetCourse.id)
    .select("id");
  report(
    23,
    "CRU-54: A updates own courses row directly → 0 rows",
    !!r.error || isEmpty(r),
    describe(r),
  );

  r = await a.client
    .from("events")
    .insert({
      course_id: targetCourse.id,
      external_uid: `cru-54-probe-${Date.now()}`,
      source: "manual",
      type: "quiz",
      title: "CRU-54 probe",
      due_at: new Date().toISOString(),
    })
    .select("id");
  report(
    24,
    "CRU-54: A inserts an event into own course directly → refused",
    !!r.error,
    r.error ? describe(r) : `INSERTED ${JSON.stringify(r.data)} — remove it with the service role`,
  );

  r = await a.client
    .from("week_scores")
    .insert({ user_id: a.userId, week_start_date: "2000-01-03", total_hours: 0 })
    .select("id");
  report(
    24,
    "CRU-54: A inserts own week_scores row directly → refused",
    !!r.error,
    r.error ? describe(r) : `INSERTED ${JSON.stringify(r.data)} — remove it with the service role`,
  );

  if (local) await lecturerChecks(aCourses);

  // 36. The sync claim is server-only, so a student can't reset their own limit.
  r = await b.client.rpc("claim_calendar_sync", { _user_id: b.userId });
  report(36, "CRU-66: a student calls claim_calendar_sync → refused", isDenied(r), describe(r));
  r = await anon.rpc("claim_calendar_sync", { _user_id: b.userId });
  report(37, "CRU-66: no session calls claim_calendar_sync → refused", isDenied(r), describe(r));

  if (local) await syncClaimChecks(a.userId);

  // Restore A's hours (completed_at can't be cleared — see header)
  if (original.actual_hours_logged !== null) {
    await a.client.rpc("log_actual_hours", {
      _event_id: target.id,
      _hours: original.actual_hours_logged,
    });
  } else {
    console.log(
      `\nNote: event ${target.id} had no logged hours before; it now shows 4. Reset it in the dashboard if needed.`,
    );
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

// 25–35. The seed lecturer (supabase/seed.sql) is linked to PROG6221
// (10 students) and XISD5319 (6, below the minimum cohort of 8), and not to
// ADDB6311 (8 students). Student A is student01, on all three.
async function lecturerChecks(aCourses: { id: string; code: string | null }[]) {
  const lec = newClient();
  const { error: signInError } = await lec.auth.signInWithPassword({
    email: "lecturer@myemeris.edu.za",
    password: SEED_PASSWORD,
  });
  if (signInError) {
    report(25, "Seed lecturer signs in", false, signInError.message);
    return;
  }
  const courseOf = (code: string) => aCourses.find((c) => c.code === code)!;

  let r: Result = await lec.rpc("lecturer_courses");
  const codes = Array.isArray(r.data) ? r.data.map((row: { code: string }) => row.code) : [];
  report(
    25,
    "lecturer_courses: lecturer → exactly their linked courses",
    !r.error && codes.join(",") === "PROG6221,XISD5319",
    r.error ? describe(r) : `codes: ${codes.join(", ")}`,
  );

  r = await lec.rpc("lecturer_cohort_weeks", { _code: "PROG6221" });
  const first = Array.isArray(r.data) ? (r.data[0] as { student_count: number }) : undefined;
  report(
    26,
    "lecturer_cohort_weeks: own course of 10 → aggregates",
    !r.error && first?.student_count === 10,
    r.error ? describe(r) : `${describe(r)}, student_count ${first?.student_count}`,
  );

  r = await lec.rpc("lecturer_cohort_weeks", { _code: "XISD5319" });
  report(27, "lecturer_cohort_weeks: own course of 6 → empty", isEmpty(r), describe(r));

  r = await lec.rpc("lecturer_cohort_weeks", { _code: "XISD5319", _min_cohort: 1 });
  report(
    28,
    "CRU-55: lecturer_cohort_weeks with _min_cohort = 1 on a course of 6 → empty",
    isEmpty(r),
    describe(r),
  );

  r = await lec.rpc("lecturer_cohort_weeks", { _code: "ADDB6311" });
  report(29, "lecturer_cohort_weeks: someone else's course → empty", isEmpty(r), describe(r));

  r = await lec.rpc("lecturer_due_dates", { _code: "ADDB6311" });
  report(30, "lecturer_due_dates: someone else's course → empty", isEmpty(r), describe(r));

  r = await lec.rpc("lecturer_due_dates", { _code: "PROG6221" });
  const synced = Array.isArray(r.data)
    ? (r.data as { id: string; source: string }[]).find((d) => d.source === "ics_sync")
    : undefined;
  if (!synced) {
    report(31, "lecturer_due_dates: own course lists synced dates", false, describe(r));
    return;
  }
  r = await lec.rpc("lecturer_delete_due_date", { _event_id: synced.id });
  report(
    31,
    "lecturer_delete_due_date: synced (ics_sync) event → refused",
    errorIs(r, "Due date not found or not manually created"),
    describe(r),
  );

  const prog = courseOf("PROG6221");
  const dueAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  r = await lec.rpc("lecturer_upsert_due_date", {
    _course_id: prog.id,
    _title: "CRU-54 probe",
    _due_at: dueAt,
    _event_id: synced.id,
  });
  report(
    32,
    "lecturer_upsert_due_date: editing a synced event → refused",
    errorIs(r, "Due date not found or not manually created"),
    describe(r),
  );

  r = await lec.rpc("lecturer_upsert_due_date", {
    _course_id: courseOf("ADDB6311").id,
    _title: "CRU-54 probe",
    _due_at: dueAt,
  });
  report(
    33,
    "lecturer_upsert_due_date: someone else's course → 'Course not found'",
    errorIs(r, "Course not found"),
    describe(r),
  );

  r = await lec.from("events").select("id").eq("course_id", prog.id);
  report(34, "RLS: lecturer reads a student's events directly → empty", isEmpty(r), describe(r));

  // 35. The success path: a manual due date fans out to the class, then goes.
  const a = newClient();
  await a.auth.signInWithPassword({
    email: "student01@myemeris.edu.za",
    password: SEED_PASSWORD,
  });
  const probes = async () =>
    (await a.from("events").select("id").eq("course_id", prog.id).eq("title", "CRU-54 probe")).data
      ?.length ?? 0;
  r = await lec.rpc("lecturer_upsert_due_date", {
    _course_id: prog.id,
    _title: "CRU-54 probe",
    _due_at: dueAt,
  });
  const created = r.error ? 0 : await probes();
  const deleted = r.error
    ? r
    : await lec.rpc("lecturer_delete_due_date", { _event_id: r.data as string });
  const left = await probes();
  report(
    35,
    "lecturer adds a due date → student sees it; deletes it → gone",
    !r.error && !deleted.error && created === 1 && left === 0,
    r.error
      ? describe(r)
      : deleted.error
        ? `delete: ${describe(deleted)}`
        : `student saw ${created}, then ${left}`,
  );
}

// 38–43. The limit itself, called as the server does. Local only: it writes to
// the student's calendar_sources row with the service role.
async function syncClaimChecks(userId: string) {
  const admin = createClient(url!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  type Claim = { source_id: string; retry_in_seconds: number };
  const claim = async (newLink?: string) => {
    const { data, error } = await admin.rpc("claim_calendar_sync", {
      _user_id: userId,
      ...(newLink ? { _new_ics_url_encrypted: newLink } : {}),
    });
    if (error) throw error;
    return (data as Claim[])[0] ?? null;
  };
  const row = () => admin.from("calendar_sources").select("*").eq("user_id", userId).single();
  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
  const setTimes = (attempted: string | null, synced: string | null) =>
    admin
      .from("calendar_sources")
      .update({ last_sync_attempt_at: attempted, last_synced_at: synced })
      .eq("user_id", userId);

  await admin.from("calendar_sources").delete().eq("user_id", userId);
  try {
    const none = await claim();
    report(38, "CRU-66: no calendar and no new link → no claim", none === null, `${none}`);

    const together = await Promise.all(Array.from({ length: 5 }, () => claim("first-link")));
    const winners = together.filter((c) => c?.retry_in_seconds === 0).length;
    report(
      39,
      "CRU-66: five concurrent claims → exactly one wins",
      winners === 1,
      `${winners} won`,
    );

    // No successful sync yet: this is the failed-attempt case.
    const afterFailure = await claim();
    const failWait = afterFailure?.retry_in_seconds ?? 0;
    report(
      40,
      "CRU-66: straight after a failed attempt → refused for up to 30s",
      failWait > 0 && failWait <= 30,
      `retry in ${failWait}s`,
    );

    const refused = await claim("second-link");
    const kept = (await row()).data?.ics_url_encrypted;
    report(
      41,
      "CRU-66: a refused claim doesn't replace the saved link",
      (refused?.retry_in_seconds ?? 0) > 0 && kept === "first-link",
      `saved: ${kept}`,
    );

    await setTimes(ago(31), ago(10));
    const afterSuccess = (await claim())?.retry_in_seconds ?? 0;
    report(
      42,
      "CRU-66: 10s after a successful sync → refused for about 110s",
      afterSuccess > 100 && afterSuccess <= 110,
      `retry in ${afterSuccess}s`,
    );

    await setTimes(ago(31), ago(121));
    const won = await claim("third-link");
    const saved = (await row()).data?.ics_url_encrypted;
    report(
      43,
      "CRU-66: once both gaps have passed → claim wins and saves the new link",
      won?.retry_in_seconds === 0 && saved === "third-link",
      `retry ${won?.retry_in_seconds}s, saved: ${saved}`,
    );
  } finally {
    await admin.from("calendar_sources").delete().eq("user_id", userId);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
