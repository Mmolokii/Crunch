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
 *   - Lecturer success paths, the manual-only guard against a lecturer's own
 *     ics_sync rows, the min-cohort threshold and (code, school) fan-out
 *     isolation — all need a lecturer test account (CRU-17).
 *   - Subdomain email rejection in complete_signup — needs a throwaway
 *     `x@sub.myemeris.edu.za` signup, which this script won't create.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const accounts = {
  A: [process.env.TEST_STUDENT_A_EMAIL, process.env.TEST_STUDENT_A_PASSWORD],
  B: [process.env.TEST_STUDENT_B_EMAIL, process.env.TEST_STUDENT_B_PASSWORD],
} as const;

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
  if (process.argv.includes("--signup-probe")) {
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
