import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { runCalendarSync, type SyncResult } from "@/lib/calendar-sync";
import { decryptIcsUrl, encryptIcsUrl } from "@/lib/ics-encryption";
import { isAllowedFeedUrl } from "@/lib/ics-url";
import { publicError } from "@/lib/server-errors";
import { cooldownSecondsLeft } from "@/lib/sync-cooldown";
import type { AppEvent } from "@/lib/workload";

export type { SyncResult } from "@/lib/calendar-sync";

// Shape only; whether Crunch will fetch it is isAllowedFeedUrl's call, so a
// wrong host comes back as an "invalid_url" result the UI can render.
const icsUrlSchema = z.object({
  icsUrl: z.string().trim().min(1).max(2048),
});

type CourseRow = { code: string | null; name: string };

async function readOwnSource(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase
    .from("calendar_sources")
    .select("id, last_synced_at")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw publicError(error, "readOwnSource");
  return data;
}

export const getCalendarSource = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calendar_sources")
      .select("id, ics_url_encrypted, last_synced_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw publicError(error, "getCalendarSource");
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
  .handler(async ({ data, context }): Promise<SyncResult> => {
    if (!isAllowedFeedUrl(data.icsUrl)) return { status: "invalid_url" };

    const existing = await readOwnSource(context);
    const wait = cooldownSecondsLeft(existing?.last_synced_at ?? null);
    if (wait > 0) return { status: "cooldown", retryInSeconds: wait };

    // Students have no direct write grant on calendar_sources (CRU-23), so
    // this is the only write path. user_id comes from the verified session.
    const { data: saved, error } = await supabaseAdmin
      .from("calendar_sources")
      .upsert(
        { user_id: context.userId, ics_url_encrypted: encryptIcsUrl(data.icsUrl) },
        { onConflict: "user_id" },
      )
      .select("id")
      .single();
    if (error) throw publicError(error, "saveCalendarSource");

    return runCalendarSync(saved.id);
  });

/**
 * Manual "Sync now" — Trigger 2 in the ADR. Re-runs the same sync against
 * whatever feed URL is already saved, without changing it.
 */
export const syncCalendarNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncResult | { status: "no_source" }> => {
    const existing = await readOwnSource(context);
    if (!existing) return { status: "no_source" };
    const wait = cooldownSecondsLeft(existing.last_synced_at);
    if (wait > 0) return { status: "cooldown", retryInSeconds: wait };
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
    if (error) throw publicError(error, "getMyEvents");

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
    if (error) throw publicError(error, "getMyCourses");
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
    if (error) throw publicError(error, "logActualHours");
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
    if (error) throw publicError(error, "getMyProfile");
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
    if (error) throw publicError(error, "getNotificationPrefs");
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
    if (error) throw publicError(error, "saveNotificationPrefs");
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
    if (error) throw publicError(error, "getLecturerCourses");
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
    if (error) throw publicError(error, "getCohortWeeks");
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
    if (error) throw publicError(error, "getLecturerDueDates");
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
    if (error) throw publicError(error, "upsertDueDate");
    return { id };
  });

export const deleteDueDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("lecturer_delete_due_date", {
      _event_id: data.eventId,
    });
    if (error) throw publicError(error, "deleteDueDate");
    return { ok: true };
  });
