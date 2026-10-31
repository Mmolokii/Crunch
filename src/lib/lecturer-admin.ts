/**
 * Pure helpers for scripts/lecturer.ts, the pilot's way of onboarding a
 * lecturer (CRU-51, docs/adr/0011-lecturer-onboarding.md): parse the command
 * line, and work out which course rows a link would change. No I/O, so the
 * rules are unit tested here and the script only does the reads and writes.
 */

export const UNIVERSITY_DOMAIN = "myemeris.edu.za";

export type LecturerCommand =
  | { command: "add"; email: string; courses: string[]; note: string | null; yes: boolean }
  | { command: "remove"; email: string; yes: boolean }
  | { command: "list" }
  | { command: "courses" };

export const USAGE = `Usage (service role; reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
  bun --env-file=.env scripts/lecturer.ts courses
  bun --env-file=.env scripts/lecturer.ts list
  bun --env-file=.env scripts/lecturer.ts add <email> [--courses CODE1,CODE2] [--note "…"] [--yes]
  bun --env-file=.env scripts/lecturer.ts remove <email> [--yes]

add and remove print what they would change and only write with --yes.`;

/** Same rule as hook_require_university_email: exactly one @, right domain. */
export function isUniversityEmail(email: string): boolean {
  const parts = email.split("@");
  return parts.length === 2 && parts[0] !== "" && parts[1] === UNIVERSITY_DOMAIN;
}

/** Comma-separated codes, trimmed, blanks dropped, duplicates removed (case-insensitive). */
export function parseCourseCodes(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of raw.split(",").map((c) => c.trim())) {
    if (!code || seen.has(code.toUpperCase())) continue;
    seen.add(code.toUpperCase());
    out.push(code);
  }
  return out;
}

export function parseLecturerArgs(argv: string[]): LecturerCommand {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--yes") flags.set("yes", true);
    else if (arg === "--courses" || arg === "--note") {
      const value = rest[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      flags.set(arg.slice(2), value);
    } else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else positional.push(arg);
  }

  if (command === "list" || command === "courses") {
    if (positional.length || flags.size) throw new Error(`${command} takes no arguments`);
    return { command };
  }
  if (command !== "add" && command !== "remove") throw new Error(USAGE);

  if (positional.length !== 1) throw new Error(`${command} needs exactly one email address`);
  const email = positional[0]!.trim().toLowerCase();
  if (!isUniversityEmail(email)) {
    throw new Error(`${email} isn't an @${UNIVERSITY_DOMAIN} address`);
  }
  const yes = flags.get("yes") === true;

  if (command === "remove") {
    if (flags.has("courses") || flags.has("note")) throw new Error("remove only takes --yes");
    return { command, email, yes };
  }
  const courses =
    typeof flags.get("courses") === "string"
      ? parseCourseCodes(flags.get("courses") as string)
      : [];
  const note =
    typeof flags.get("note") === "string" ? (flags.get("note") as string).trim() || null : null;
  return { command, email, courses, note, yes };
}

export type CourseRow = { id: string; code: string | null; lecturer_id: string | null };

export type LinkPlan = {
  /** Rows to set lecturer_id on. */
  toLink: string[];
  /** Rows already linked to this lecturer. */
  alreadyLinked: number;
  /** Codes whose rows belong to a different lecturer; never overwritten. */
  takenByOther: string[];
  /** Codes no student on Crunch has yet. */
  missing: string[];
};

/**
 * Which rows a link would change. Matching is on the exact course code, the
 * same way the lecturer functions group a cohort. A row already linked to
 * someone else is left alone: two lecturers on one course needs a decision,
 * not a silent overwrite.
 */
export function planLink(codes: string[], rows: CourseRow[], lecturerId: string): LinkPlan {
  const plan: LinkPlan = { toLink: [], alreadyLinked: 0, takenByOther: [], missing: [] };
  for (const code of codes) {
    const matching = rows.filter((r) => r.code === code);
    if (matching.length === 0) {
      plan.missing.push(code);
      continue;
    }
    let taken = false;
    for (const row of matching) {
      if (row.lecturer_id === lecturerId) plan.alreadyLinked++;
      else if (row.lecturer_id === null) plan.toLink.push(row.id);
      else taken = true;
    }
    if (taken) plan.takenByOther.push(code);
  }
  return plan;
}

export type CourseSummary = { code: string; name: string; students: number; lecturerIds: string[] };

/** One line per course code, for the `courses` command. */
export function summariseCourses(
  rows: { code: string | null; name: string; user_id: string | null; lecturer_id: string | null }[],
): CourseSummary[] {
  const byCode = new Map<string, { name: string; students: Set<string>; lecturers: Set<string> }>();
  for (const row of rows) {
    if (!row.code) continue;
    const entry = byCode.get(row.code) ?? {
      name: row.name,
      students: new Set(),
      lecturers: new Set(),
    };
    if (row.user_id) entry.students.add(row.user_id);
    if (row.lecturer_id) entry.lecturers.add(row.lecturer_id);
    byCode.set(row.code, entry);
  }
  return [...byCode.entries()]
    .map(([code, e]) => ({
      code,
      name: e.name,
      students: e.students.size,
      lecturerIds: [...e.lecturers],
    }))
    .sort((a, b) => b.students - a.students || a.code.localeCompare(b.code));
}
