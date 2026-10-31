/**
 * Onboard or offboard a pilot lecturer (CRU-51, docs/adr/0011-lecturer-onboarding.md).
 * Lecturer access is two things, and this script does both:
 *
 *   1. the lecturer role: their email in `lecturer_allowlist`, which
 *      complete_signup reads at first sign-in (CRU-24);
 *   2. their courses: `courses.lecturer_id` on the student rows of each course,
 *      which every lecturer_* database function filters on.
 *
 * Usage: see USAGE in src/lib/lecturer-admin.ts, or run with no arguments.
 *
 *   courses   course codes on Crunch, students per code, current lecturer
 *   list      the allow-list, who has signed up, what each is linked to
 *   add       allow-list; promote if already signed up; link --courses
 *   remove    unlink their courses, demote to student, delete from the allow-list
 *
 * add and remove print the plan and only write with --yes. Needs
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY: run it from a maintainer's
 * machine, never in CI. Record each run in the CRU-17 issue (who, which
 * courses, the expiry IT asked for).
 */
import { supabaseAdmin as db } from "../src/integrations/supabase/client.server";
import {
  type LecturerCommand,
  parseLecturerArgs,
  planLink,
  summariseCourses,
  USAGE,
} from "../src/lib/lecturer-admin";

async function findUser(email: string) {
  const { data, error } = await db
    .from("users")
    .select("id, role")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`reading users: ${error.message}`);
  return data;
}

async function emailsById(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const { data, error } = await db.from("users").select("id, email").in("id", ids);
  if (error) throw new Error(`reading users: ${error.message}`);
  return new Map(data.map((u) => [u.id, u.email]));
}

async function courses() {
  const { data, error } = await db.from("courses").select("code, name, user_id, lecturer_id");
  if (error) throw new Error(`reading courses: ${error.message}`);
  const summary = summariseCourses(data);
  const emails = await emailsById([...new Set(summary.flatMap((c) => c.lecturerIds))]);
  if (summary.length === 0) return console.log("No courses on Crunch yet.");
  for (const c of summary) {
    const lecturers = c.lecturerIds.map((id) => emails.get(id) ?? id).join(", ") || "no lecturer";
    console.log(
      `${c.code.padEnd(12)} ${String(c.students).padStart(3)} students  ${c.name}  (${lecturers})`,
    );
  }
  console.log("\nThe cohort heatmap needs 8 or more students (LECTURER_MIN_COHORT).");
}

async function list() {
  const { data: allow, error } = await db
    .from("lecturer_allowlist")
    .select("email, added_at, note")
    .order("added_at");
  if (error) throw new Error(`reading lecturer_allowlist: ${error.message}`);
  if (allow.length === 0) return console.log("The lecturer allow-list is empty.");
  for (const row of allow) {
    const user = await findUser(row.email);
    let status = "not signed up yet";
    if (user) {
      const { data: linked } = await db.from("courses").select("code").eq("lecturer_id", user.id);
      const codes = [...new Set((linked ?? []).map((c) => c.code ?? "—"))];
      status = `${user.role}; courses: ${codes.join(", ") || "none linked"}`;
    }
    console.log(
      `${row.email}  added ${row.added_at.slice(0, 10)}  ${status}${row.note ? `  (${row.note})` : ""}`,
    );
  }
}

async function add(cmd: Extract<LecturerCommand, { command: "add" }>) {
  const steps: (() => Promise<void>)[] = [];
  const say = (line: string) => console.log(`  • ${line}`);
  console.log(`Plan for ${cmd.email}:`);

  say(`allow-list ${cmd.email}${cmd.note ? ` (note: ${cmd.note})` : ""}`);
  steps.push(async () => {
    const { error } = await db
      .from("lecturer_allowlist")
      .upsert(
        { email: cmd.email, ...(cmd.note ? { note: cmd.note } : {}) },
        { onConflict: "email" },
      );
    if (error) throw new Error(`allow-listing: ${error.message}`);
  });

  const user = await findUser(cmd.email);
  if (!user) {
    say("not signed up yet: they become a lecturer at first sign-in");
    if (cmd.courses.length)
      say(`can't link ${cmd.courses.join(", ")} until they sign up; run add again then`);
  } else {
    if (user.role !== "lecturer") {
      say("already signed up as a student: promote to lecturer");
      steps.push(async () => {
        const { error } = await db.from("users").update({ role: "lecturer" }).eq("id", user.id);
        if (error) throw new Error(`promoting: ${error.message}`);
      });
    }
    if (cmd.courses.length) {
      const { data: rows, error } = await db
        .from("courses")
        .select("id, code, lecturer_id")
        .in("code", cmd.courses);
      if (error) throw new Error(`reading courses: ${error.message}`);
      const plan = planLink(cmd.courses, rows, user.id);
      say(`link ${plan.toLink.length} student course row(s); ${plan.alreadyLinked} already linked`);
      for (const code of plan.missing)
        say(`WARNING: no student on Crunch has ${code} yet (check the code with \`courses\`)`);
      for (const code of plan.takenByOther)
        say(`WARNING: ${code} is already linked to another lecturer; those rows are left alone`);
      if (plan.toLink.length) {
        steps.push(async () => {
          const { error: e } = await db
            .from("courses")
            .update({ lecturer_id: user.id })
            .in("id", plan.toLink);
          if (e) throw new Error(`linking courses: ${e.message}`);
        });
      }
    }
  }
  await apply(steps, cmd.yes);
}

async function remove(cmd: Extract<LecturerCommand, { command: "remove" }>) {
  const steps: (() => Promise<void>)[] = [];
  const say = (line: string) => console.log(`  • ${line}`);
  console.log(`Plan for ${cmd.email}:`);

  const user = await findUser(cmd.email);
  if (user) {
    const { count } = await db
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("lecturer_id", user.id);
    say(
      `unlink ${count ?? 0} course row(s); manual due dates they added stay on students' calendars`,
    );
    steps.push(async () => {
      const { error } = await db
        .from("courses")
        .update({ lecturer_id: null })
        .eq("lecturer_id", user.id);
      if (error) throw new Error(`unlinking: ${error.message}`);
    });
    if (user.role === "lecturer") {
      say("demote to student");
      steps.push(async () => {
        const { error } = await db.from("users").update({ role: "student" }).eq("id", user.id);
        if (error) throw new Error(`demoting: ${error.message}`);
      });
    }
  } else {
    say("no account with this email");
  }
  say("delete from the allow-list");
  steps.push(async () => {
    const { error } = await db.from("lecturer_allowlist").delete().eq("email", cmd.email);
    if (error) throw new Error(`removing from allow-list: ${error.message}`);
  });
  await apply(steps, cmd.yes);
}

async function apply(steps: (() => Promise<void>)[], yes: boolean) {
  if (!yes) return console.log("\nDry run: nothing changed. Re-run with --yes to apply.");
  for (const step of steps) await step();
  console.log("\nDone. Note it on the CRU-17 issue (who, which courses, expiry).");
}

async function main() {
  let cmd: LecturerCommand;
  try {
    cmd = parseLecturerArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    if (!(err instanceof Error && err.message === USAGE)) console.error(`\n${USAGE}`);
    process.exit(1);
  }
  if (cmd.command === "courses") await courses();
  else if (cmd.command === "list") await list();
  else if (cmd.command === "add") await add(cmd);
  else await remove(cmd);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
