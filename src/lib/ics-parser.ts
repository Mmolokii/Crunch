/**
 * Pure ICS parsing and event classification for Brightspace/D2L calendar feeds.
 * No I/O here — fetching and database writes live in calendar-sync.ts.
 *
 * Built against a real export from an @myemeris.edu.za Brightspace calendar
 * subscription link (see docs/adr/0001-sync-pipeline.md, action item 1), not
 * assumed structure. Two things that sample showed the ADR's original
 * assumptions got wrong:
 *
 * 1. Course identification lives in LOCATION, not SUMMARY — Brightspace stamps
 *    every VEVENT's LOCATION with a scheduling string like
 *    "Programming 2A PROG6221 2026 FT BCAD0701 EMGPMD Term1 GR01". The course
 *    code (PROG6221) and a human course name are both extractable from it.
 * 2. DESCRIPTION starts with a category label — "Assignments:", "Quizzes:",
 *    "Surveys:", "Discussions:" — which classifies far more reliably than
 *    keyword-matching the title alone. The title is still checked, both as a
 *    fallback and to separate exam/essay-shaped assignments from ordinary ones.
 *
 * The sample was pulled outside exam period, so it had zero exam-type events —
 * "exam" classification is untested against real data. Treat it as the
 * shakiest branch of the classifier until a feed spanning exams is seen.
 *
 * The sample also confirmed a real quirk: every quiz appears as three separate
 * VEVENTs ("X – Available", "X – Due", "X – Availability Ends") for one actual
 * deliverable. Only "Due" is a deadline a student should see or log hours
 * against — the other two are access-window bookends, so classifyEvent marks
 * them `skip: true` rather than syncing three cards for one quiz.
 */

export type CanonicalEventType = "problem_set" | "essay" | "exam" | "quiz" | "reading" | "other";

export interface ParsedIcsEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  dtstart: Date | null;
  dtend: Date | null;
}

export interface ClassifiedEvent {
  uid: string;
  title: string;
  courseCode: string | null;
  courseName: string | null;
  type: CanonicalEventType;
  dueAt: Date;
  /** True for a quiz "Available" / "Availability Ends" marker — not a distinct deliverable, should not be synced as its own event. */
  skip: boolean;
}

/** Unfolds RFC 5545 line continuations: a leading space or tab on a physical line means "join with the previous line". */
function unfoldLines(raw: string): string[] {
  const rawLines = raw.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** Un-escapes ICS TEXT value escaping: \\ \; \, \n */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parsePropertyLine(line: string): { name: string; value: string } | null {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) return null;
  const head = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const semiIndex = head.indexOf(";");
  const name = (semiIndex === -1 ? head : head.slice(0, semiIndex)).toUpperCase();
  return { name, value };
}

/** Parses a DTSTART/DTEND value into a Date. Every event in the observed sample was UTC (trailing Z); a floating local time with no Z still parses, just without a timezone. */
function parseIcsDate(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? "Z" : ""}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Extracts every VEVENT block from a raw ICS feed body. Throws if the feed doesn't look like ICS at all — callers map that to `invalid_url`. */
export function parseIcs(raw: string): ParsedIcsEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(raw)) {
    throw new Error("Not a valid ICS feed (missing BEGIN:VCALENDAR).");
  }

  const lines = unfoldLines(raw);
  const events: ParsedIcsEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^BEGIN:VEVENT$/i.test(trimmed)) {
      current = {};
      continue;
    }
    if (/^END:VEVENT$/i.test(trimmed)) {
      if (current) {
        events.push({
          uid: current["UID"] ?? "",
          summary: current["SUMMARY"] ?? "",
          description: current["DESCRIPTION"] ?? "",
          location: current["LOCATION"] ?? "",
          dtstart: current["DTSTART"] ? parseIcsDate(current["DTSTART"]) : null,
          dtend: current["DTEND"] ? parseIcsDate(current["DTEND"]) : null,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const prop = parsePropertyLine(line);
    if (!prop) continue;
    current[prop.name] = unescapeText(prop.value);
  }

  return events.filter((e) => e.uid.length > 0);
}

/** Matches Brightspace's scheduling string in LOCATION, e.g. "Programming 2A PROG6221 2026 FT BCAD0701 EMGPMD Term1 GR01". */
const COURSE_CODE_PATTERN = /\b([A-Z]{4}\d{4})\b/;

function extractCourse(location: string): { code: string | null; name: string | null } {
  const match = COURSE_CODE_PATTERN.exec(location);
  if (!match) return { code: null, name: null };
  const code = match[1]!;
  const name = location.slice(0, match.index).trim() || code;
  return { code, name };
}

/** The DESCRIPTION category label Brightspace prefixes every entry with. */
function descriptionCategory(
  description: string,
): "assignment" | "quiz" | "survey" | "discussion" | null {
  if (/\bAssignments:/.test(description)) return "assignment";
  if (/\bQuizzes:/.test(description)) return "quiz";
  if (/\bSurveys:/.test(description)) return "survey";
  if (/\bDiscussions:/.test(description)) return "discussion";
  return null;
}

/**
 * Brightspace suffixes every SUMMARY with what kind of calendar marker this
 * is (both a plain hyphen and an en dash show up in real feeds). Only "Due"
 * is an actual deliverable deadline.
 */
function summaryMarker(summary: string): "due" | "available" | "availability_ends" | "other" {
  const trimmed = summary.trim();
  if (/[-–]\s*Availability Ends$/.test(trimmed)) return "availability_ends";
  if (/[-–]\s*Available$/.test(trimmed)) return "available";
  if (/[-–]\s*Due$/.test(trimmed)) return "due";
  return "other";
}

function stripMarkerSuffix(summary: string): string {
  return summary.replace(/\s*[-–]\s*(Due|Available|Availability Ends)\s*$/, "").trim();
}

const TITLE_KEYWORDS: Array<[RegExp, CanonicalEventType]> = [
  [/\b(exam|test|final)\b/i, "exam"],
  [/\bquiz\b/i, "quiz"],
  [/\b(essay|paper)\b/i, "essay"],
  [/\breading\b/i, "reading"],
  [/\b(assignment|problem set|homework|ice task)\b/i, "problem_set"],
];

function classifyType(
  title: string,
  category: ReturnType<typeof descriptionCategory>,
): CanonicalEventType {
  // The description category is Brightspace's own tag — trust it over
  // guessing from free-text titles wherever it disambiguates.
  if (category === "quiz") return "quiz";
  if (category === "survey" || category === "discussion") return "other";

  for (const [pattern, type] of TITLE_KEYWORDS) {
    if (pattern.test(title)) return type;
  }

  return category === "assignment" ? "problem_set" : "other";
}

/**
 * Classifies one parsed ICS event, or returns null when there's nothing
 * useful to show (no start date to anchor a due item to).
 */
export function classifyEvent(event: ParsedIcsEvent): ClassifiedEvent | null {
  if (!event.dtstart) return null;

  const marker = summaryMarker(event.summary);
  const { code, name } = extractCourse(event.location);
  const category = descriptionCategory(event.description);
  const title = stripMarkerSuffix(event.summary) || event.summary;

  return {
    uid: event.uid,
    title,
    courseCode: code,
    courseName: name,
    type: classifyType(title, category),
    dueAt: event.dtstart,
    skip: marker === "available" || marker === "availability_ends",
  };
}
