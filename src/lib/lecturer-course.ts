import { z } from "zod";

/**
 * Which of a lecturer's courses the lecturer pages show (CRU-53). The choice
 * lives in the URL (?course=XISD5319) so it survives a refresh and can be
 * shared between the cohort and due-dates pages. Pure, no I/O.
 *
 * The code here only picks what to ask for. Whether the lecturer may see a
 * course, and whether its cohort is big enough, is still decided in Postgres.
 */

export type LecturerCourse = {
  code: string;
  name: string;
  studentCount: number;
  courseId: string;
};

/** A bad or missing ?course= is dropped rather than failing the page. */
export const courseSearchSchema = z.object({
  course: z.string().trim().min(1).max(64).optional().catch(undefined),
});

export type CourseSearch = z.infer<typeof courseSearchSchema>;

/** The course matching `code`, else the first course, else null (no courses linked). */
export function selectCourse<T extends LecturerCourse>(
  courses: readonly T[],
  code: string | undefined,
): T | null {
  return courses.find((c) => c.code === code) ?? courses[0] ?? null;
}

/** True when the cohort is too small for any aggregate to be shown. */
export function belowMinCohort(course: LecturerCourse, minCohort: number): boolean {
  return course.studentCount < minCohort;
}

/** Switcher label, e.g. "XISD5319 · Intro to Systems — 6 students (below 8)". */
export function courseOptionLabel(course: LecturerCourse, minCohort?: number): string {
  const students = `${course.studentCount} ${course.studentCount === 1 ? "student" : "students"}`;
  const small =
    minCohort !== undefined && belowMinCohort(course, minCohort) ? ` (below ${minCohort})` : "";
  return `${course.code} · ${course.name} — ${students}${small}`;
}
