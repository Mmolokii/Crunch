/** Shared workload types and pure grouping helpers used by live Supabase data. */

export type Level = "Light" | "Moderate" | "Heavy" | "Brutal";

export type AppEvent = {
  id: string;
  title: string;
  courseCode: string;
  courseName: string;
  type: string;
  dueAt: string;
  estimatedHours: number;
  isHighStakes: boolean;
  actualHoursLogged: number | null;
  completed: boolean;
  source: string;
};

export type AppWeek = {
  weekStart: string;
  label: string;
  range: string;
  totalHours: number;
  level: Level;
  events: AppEvent[];
  conflicts: { date: string; note: string }[];
};

export const levelBadge: Record<Level, string> = {
  Light: "bg-level-light text-level-light-foreground",
  Moderate: "bg-level-moderate text-level-moderate-foreground",
  Heavy: "bg-level-heavy text-level-heavy-foreground",
  Brutal: "bg-level-brutal text-level-brutal-foreground",
};

export const levelFill: Record<Level, string> = {
  Light: "bg-level-light",
  Moderate: "bg-level-moderate",
  Heavy: "bg-level-heavy",
  Brutal: "bg-level-brutal",
};

export function levelFor(hours: number): Level {
  if (hours < 8) return "Light";
  if (hours < 16) return "Moderate";
  if (hours < 26) return "Heavy";
  return "Brutal";
}

/** Monday of the week containing `d`, as YYYY-MM-DD. */
export function weekStartOf(d: Date): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (copy.getUTCDay() + 6) % 7; // Monday = 0
  copy.setUTCDate(copy.getUTCDate() - dow);
  return copy.toISOString().slice(0, 10);
}

const dayMonth = (d: Date) =>
  d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });

export function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return sameMonth
    ? `${start.getUTCDate()} – ${dayMonth(end)}`
    : `${dayMonth(start)} – ${dayMonth(end)}`;
}

export function weekLabelFor(weekStart: string, today = new Date()): string {
  const current = weekStartOf(today);
  if (weekStart === current) return "This week";
  const next = new Date(`${current}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  if (weekStart === next.toISOString().slice(0, 10)) return "Next week";
  return "Week of";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Group events into Monday-based weeks with totals, level and same-day clashes. */
export function groupIntoWeeks(events: AppEvent[], today = new Date()): AppWeek[] {
  const buckets = new Map<string, AppEvent[]>();
  for (const e of events) {
    const key = weekStartOf(new Date(e.dueAt));
    const list = buckets.get(key);
    if (list) list.push(e);
    else buckets.set(key, [e]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, list]) => {
      const sorted = [...list].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      const totalHours = round1(
        sorted.reduce((sum, e) => sum + (e.actualHoursLogged ?? e.estimatedHours ?? 0), 0),
      );
      return {
        weekStart,
        label: weekLabelFor(weekStart, today),
        range: weekRangeLabel(weekStart),
        totalHours,
        level: levelFor(totalHours),
        events: sorted,
        conflicts: findConflicts(sorted),
      };
    });
}

export function findConflicts(events: AppEvent[]): { date: string; note: string }[] {
  const byDay = new Map<string, AppEvent[]>();
  for (const e of events.filter((x) => x.isHighStakes)) {
    const day = e.dueAt.slice(0, 10);
    const list = byDay.get(day);
    if (list) list.push(e);
    else byDay.set(day, [e]);
  }

  const out: { date: string; note: string }[] = [];
  for (const [day, list] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const courses = new Set(list.map((e) => e.courseCode));
    if (list.length < 2 || courses.size < 2) continue;
    const date = new Date(`${day}T00:00:00Z`).toLocaleDateString("en-ZA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    out.push({
      date,
      note: `${list.map((e) => `${e.courseName} ${e.title.toLowerCase()}`).join(" and ")} fall on the same day.`,
    });
  }
  return out;
}

export function formatDue(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export type CourseSplit = { code: string; name: string; hours: number; share: number };
export type TypeAccuracy = { type: string; estimated: number; actual: number; count: number };

/** Hours per course (logged where available, otherwise estimated). */
export function courseSplitOf(events: AppEvent[]): CourseSplit[] {
  const byCourse = new Map<string, CourseSplit>();
  for (const e of events) {
    const hours = e.actualHoursLogged ?? e.estimatedHours ?? 0;
    const entry = byCourse.get(e.courseCode);
    if (entry) entry.hours = round1(entry.hours + hours);
    else byCourse.set(e.courseCode, { code: e.courseCode, name: e.courseName, hours: round1(hours), share: 0 });
  }
  const list = [...byCourse.values()].sort((a, b) => b.hours - a.hours);
  const max = Math.max(1, ...list.map((c) => c.hours));
  return list.map((c) => ({ ...c, share: Math.round((c.hours / max) * 100) }));
}

/** Average estimated vs actual hours per item, by assessment type (logged items only). */
export function typeAccuracyOf(events: AppEvent[]): TypeAccuracy[] {
  const acc = new Map<string, { est: number; act: number; n: number }>();
  for (const e of events) {
    if (e.actualHoursLogged === null) continue;
    const entry = acc.get(e.type) ?? { est: 0, act: 0, n: 0 };
    entry.est += e.estimatedHours ?? 0;
    entry.act += e.actualHoursLogged;
    entry.n += 1;
    acc.set(e.type, entry);
  }
  return [...acc.entries()]
    .map(([type, v]) => ({
      type,
      estimated: round1(v.est / v.n),
      actual: round1(v.act / v.n),
      count: v.n,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Plain-language observations derived only from the student's own data. */
export function insightsFrom(weeks: AppWeek[], events: AppEvent[]): string[] {
  const out: string[] = [];
  if (weeks.length === 0) return out;

  const heaviest = [...weeks].sort((a, b) => b.totalHours - a.totalHours)[0]!;
  out.push(
    `Your heaviest week is ${heaviest.range} at roughly ${heaviest.totalHours} hours — ${heaviest.level.toLowerCase()} by Crunch's scoring.`,
  );

  const clashWeeks = weeks.filter((w) => w.conflicts.length > 0);
  if (clashWeeks.length > 0) {
    out.push(
      `${clashWeeks.length} week${clashWeeks.length > 1 ? "s have" : " has"} two high-stakes deadlines landing on the same day. Those are the ones worth planning backwards from.`,
    );
  }

  const logged = events.filter((e) => e.actualHoursLogged !== null);
  if (logged.length >= 3) {
    const est = logged.reduce((s, e) => s + (e.estimatedHours ?? 0), 0);
    const act = logged.reduce((s, e) => s + (e.actualHoursLogged ?? 0), 0);
    if (est > 0) {
      const diff = Math.round(((act - est) / est) * 100);
      if (Math.abs(diff) >= 10) {
        out.push(
          `Across ${logged.length} logged items you spent about ${Math.abs(diff)}% ${diff > 0 ? "more" : "less"} time than estimated.`,
        );
      } else {
        out.push(`Across ${logged.length} logged items your estimates are tracking within 10% of reality.`);
      }
    }
  } else {
    out.push("Log actual hours on a few items and Crunch can tell you where its estimates run high or low.");
  }

  return out;
}
