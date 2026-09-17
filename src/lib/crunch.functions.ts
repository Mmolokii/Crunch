import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runCalendarSync } from "@/lib/calendar-sync";
import { decryptIcsUrl, encryptIcsUrl } from "@/lib/ics-encryption";
import type { AppEvent } from "@/lib/workload";

export type { SyncResult } from "@/lib/calendar-sync";

const icsUrlSchema = z.object({
  icsUrl: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .regex(/^https?:\/\/[^\s]+\/d2l\/le\/calendar\/feed\/[^\s]+$/i, "Not a Brightspace feed URL"),
});

type CourseRow = { code: string | null; name: string };

export const getCalendarSource = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calendar_sources")
      .select("id, ics_url_encrypted, last_synced_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data
      ? {
          id: data.id,
          icsUrl: decryptIcsUrl(data.ics_url_encrypted),
          lastSyncedAt: data.last_synced_at,
        }
      : null;
  });

/**
 * Saves the encrypted feed URL, then calls runCalendarSync synchronously
 * before returning — Trigger 1 in docs/adr/0001-sync-pipeline.md. The caller
 * (onboarding, settings) gets a real SyncResult to render from instead of
 * inferring state from a separate courses.length === 0 check afterward.
 */
export const saveCalendarSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => icsUrlSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const encryptedUrl = encryptIcsUrl(data.icsUrl);
    const { data: existing, error: readError } = await supabase
      .from("calendar_sources")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    let calendarSourceId: string;
    if (existing) {
      const { error } = await supabase
        .from("calendar_sources")
        .update({ ics_url_encrypted: encryptedUrl })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      calendarSourceId = existing.id;
    } else {
      const { data: created, error } = await supabase
        .from("calendar_sources")
        .insert({ user_id: userId, ics_url_encrypted: encryptedUrl })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      calendarSourceId = created.id;
    }

    return runCalendarSync(calendarSourceId);
  });

/**
 * Manual "Sync now" — Trigger 2 in the ADR. Re-runs the same sync against
 * whatever feed URL is already saved, without changing it.
 */
export const syncCalendarNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: existing, error } = await context.supabase
      .from("calendar_sources")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!existing) return { status: "no_source" as const };
    return runCalendarSync(existing.id);
  });

export const getMyEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppEvent[]> => {
    const { data, error } = await context.supabase
      .from("events")
      .select(
        "id, title, type, due_at, estimated_hours, is_high_stakes, actual_hours_logged, completed_at, source, courses!inner(code, name)",
      )
      .order("due_at", { ascending: true });
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const course = (row.courses ?? {}) as CourseRow;
      return {
        id: row.id,
        title: row.title,
        courseCode: course.code ?? "—",
        courseName: course.name ?? "Course",
        type: row.type,
        dueAt: row.due_at,
        estimatedHours: Number(row.estimated_hours ?? 0),
        isHighStakes: Boolean(row.is_high_stakes),
        actualHoursLogged:
          row.actual_hours_logged === null ? null : Number(row.actual_hours_logged),
        completed: row.completed_at !== null,
        source: row.source,
      };
    });
  });

export const getMyCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("courses")
      .select("id, code, name, color")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const logActualHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ eventId: z.string().uuid(), hours: z.number().min(0).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("log_actual_hours", {
      _event_id: data.eventId,
      _hours: data.hours,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("users")
      .select("id, email, role, school, created_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const notificationPrefsSchema = z.object({
  heavyWeek: z.boolean(),
  conflict: z.boolean(),
  logHours: z.boolean(),
});

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

const DEFAULT_PREFS: NotificationPrefs = { heavyWeek: true, conflict: true, logHours: false };

export const getNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationPrefs> => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("heavy_week, conflict, log_hours")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return DEFAULT_PREFS;
    return {
      heavyWeek: data.heavy_week,
      conflict: data.conflict,
      logHours: data.log_hours,
    };
  });

export const saveNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => notificationPrefsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notification_preferences").upsert(
      {
        user_id: context.userId,
        heavy_week: data.heavyWeek,
        conflict: data.conflict,
        log_hours: data.logHours,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Minimum cohort size before any aggregate is shown. Configurable, not hardcoded in SQL. */
const MIN_COHORT_DEFAULT = 8;

function minCohort(): number {
  const raw = Number(process.env["LECTURER_MIN_COHORT"]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : MIN_COHORT_DEFAULT;
}

export const getLecturerCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("lecturer_courses");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      code: row.code,
      name: row.name,
      studentCount: row.student_count,
      courseId: row.course_id,
    }));
  });

export const getCohortWeeks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const threshold = minCohort();
    const { data: rows, error } = await context.supabase.rpc("lecturer_cohort_weeks", {
      _code: data.code,
      _min_cohort: threshold,
    });
    if (error) throw new Error(error.message);
    return {
      minCohort: threshold,
      weeks: (rows ?? []).map((row) => ({
        weekStart: row.week_start,
        avgHours: Number(row.avg_hours ?? 0),
        studentCount: row.student_count,
      })),
    };
  });

export const getLecturerDueDates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("lecturer_due_dates", {
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      id: row.id,
      courseId: row.course_id,
      title: row.title,
      type: row.type,
      dueAt: row.due_at,
      estimatedHours: Number(row.estimated_hours ?? 0),
      isHighStakes: Boolean(row.is_high_stakes),
      source: row.source,
    }));
  });

const dueDateInput = z.object({
  courseId: z.string().uuid(),
  eventId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  dueAt: z.string().min(1),
  type: z.enum(["problem_set", "essay", "exam", "quiz", "reading", "other"]),
  estimatedHours: z.number().min(0).max(200),
  isHighStakes: z.boolean(),
});

export const upsertDueDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dueDateInput.parse(input))
  .handler(async ({ data, context }) => {
    const args = {
      _course_id: data.courseId,
      _title: data.title,
      _due_at: new Date(data.dueAt).toISOString(),
      _type: data.type,
      _estimated_hours: data.estimatedHours,
      _is_high_stakes: data.isHighStakes,
      ...(data.eventId ? { _event_id: data.eventId } : {}),
    };
    const { data: id, error } = await context.supabase.rpc("lecturer_upsert_due_date", args);
    if (error) throw new Error(error.message);
    return { id };
  });

export const deleteDueDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("lecturer_delete_due_date", {
      _event_id: data.eventId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
