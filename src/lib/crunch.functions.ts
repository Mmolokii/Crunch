import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { runCalendarSync, type SyncResult } from "@/lib/calendar-sync";
import { encryptIcsUrl } from "@/lib/ics-encryption";
import { isAllowedFeedUrl } from "@/lib/ics-url";
import { passwordConfirmedRecently } from "@/lib/password";
import { GENERIC_ERROR_MESSAGE, publicError } from "@/lib/server-errors";
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

/**
 * Claims one student-triggered sync (CRU-66), and stores a new feed link if the
 * claim wins. Postgres holds the limit, so concurrent requests can't all pass.
 * Returns null when the student has no calendar and sent no new link.
 */
async function claimSync(userId: string, newIcsUrlEncrypted?: string) {
  const { data, error } = await supabaseAdmin.rpc("claim_calendar_sync", {
    _user_id: userId,
    ...(newIcsUrlEncrypted ? { _new_ics_url_encrypted: newIcsUrlEncrypted } : {}),
  });
  if (error) throw publicError(error, "claimSync");
  return data[0] ?? null;
}

/**
 * Whether a calendar is connected, and when it last synced (CRU-65). Never the
 * link itself: it's a live credential to the student's Brightspace calendar,
 * so once saved it stays on the server. A student replaces it by saving a new one.
 */
export const getCalendarSource = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const source = await readOwnSource(context);
    return source ? { id: source.id, lastSyncedAt: source.last_synced_at } : null;
  });

/**
 * Saves the encrypted feed URL, then calls runCalendarSync synchronously
 * before returning — Trigger 1 in docs/adr/0001-sync-pipeline.md. The caller
 * (onboarding, settings) gets a real SyncResult to render from instead of
 * inferring state from a separate courses.length === 0 check afterward.
 */
export const saveCalendarSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => icsUrlSchema.parse(input))
  .handler(async ({ data, context }): Promise<SyncResult> => {
    // Checked before the claim, so a mistyped link can be retried straight away.
    if (!isAllowedFeedUrl(data.icsUrl)) return { status: "invalid_url" };

    // Students have no direct write grant on calendar_sources (CRU-23), so
    // this is the only write path. user_id comes from the verified session.
    const claim = await claimSync(context.userId, encryptIcsUrl(data.icsUrl));
    if (!claim) throw new Error(GENERIC_ERROR_MESSAGE);
    if (claim.retry_in_seconds > 0) {
      return { status: "cooldown", retryInSeconds: claim.retry_in_seconds };
    }

    return runCalendarSync(claim.source_id);
  });

/**
 * Manual "Sync now" — Trigger 2 in the ADR. Re-runs the same sync against
 * whatever feed URL is already saved, without changing it.
 */
export const syncCalendarNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncResult | { status: "no_source" }> => {
    const claim = await claimSync(context.userId);
    if (!claim) return { status: "no_source" };
    if (claim.retry_in_seconds > 0) {
      return { status: "cooldown", retryInSeconds: claim.retry_in_seconds };
    }
    return runCalendarSync(claim.source_id);
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
  .validator((input: unknown) =>
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

/**
 * "Download my data" (CRU-32, POPIA right of access). Reads through the
 * student's own session, so Row Level Security limits it to their rows.
 * The calendar feed link itself is left out: it is a live access token to
 * their Brightspace calendar and shouldn't sit in a downloaded file.
 */
export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, source, courses, events, weekScores, prefs] = await Promise.all([
      supabase
        .from("users")
        .select("email, role, school, created_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("calendar_sources")
        .select("last_synced_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("courses").select("code, name").eq("user_id", userId).order("name"),
      supabase
        .from("events")
        .select(
          "title, type, due_at, estimated_hours, is_high_stakes, actual_hours_logged, completed_at, source, courses!inner(code)",
        )
        .eq("courses.user_id", userId)
        .order("due_at"),
      supabase
        .from("week_scores")
        .select("week_start_date, total_hours, level, computed_at")
        .eq("user_id", userId)
        .order("week_start_date"),
      supabase
        .from("notification_preferences")
        .select("heavy_week, conflict, log_hours, updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    for (const r of [profile, source, courses, events, weekScores, prefs]) {
      if (r.error) throw publicError(r.error, "exportMyData");
    }
    return {
      exportedAt: new Date().toISOString(),
      account: profile.data,
      calendarFeed: source.data
        ? {
            connected: true,
            lastSyncedAt: source.data.last_synced_at,
            note: "Your Brightspace link is stored encrypted and is not included in this file. You can replace it in Settings, or find it in Brightspace under Calendar → Subscribe.",
          }
        : null,
      courses: courses.data,
      events: (events.data ?? []).map(({ courses: course, ...e }) => ({
        ...e,
        courseCode: (course as { code: string | null }).code,
      })),
      weekScores: weekScores.data,
      notificationPreferences: prefs.data,
    };
  });

/**
 * "Delete my account" (CRU-32). Deleting the auth user cascades through
 * public.users to every table holding the student's data. Needs the service
 * role: a student can't delete their own auth user through the API.
 *
 * Needs a password sign-in in the last few minutes, read from the verified
 * token, so a borrowed signed-in browser can't delete the account. The password
 * itself goes from the browser to Supabase and never reaches this server
 * (CRU-69).
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ confirm: z.literal("DELETE") }).parse(input))
  .handler(async ({ context }) => {
    if (!passwordConfirmedRecently(context.claims.amr)) {
      return { ok: false as const };
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error)
      throw publicError({ message: error.message, code: error.code ?? null }, "deleteMyAccount");
    return { ok: true as const };
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
  .validator((input: unknown) => notificationPrefsSchema.parse(input))
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

/**
 * Minimum cohort size before any aggregate is shown (ADR-0008).
 * LECTURER_MIN_COHORT can raise it; lecturer_cohort_weeks floors it at 8 in
 * SQL (CRU-55), so a lower value here would only mislabel the UI.
 */
const MIN_COHORT_FLOOR = 8;

function minCohort(): number {
  const raw = Number(process.env["LECTURER_MIN_COHORT"]);
  return Number.isFinite(raw) ? Math.max(Math.floor(raw), MIN_COHORT_FLOOR) : MIN_COHORT_FLOOR;
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
  .validator((input: unknown) => z.object({ code: z.string().min(1).max(64) }).parse(input))
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
  .validator((input: unknown) => z.object({ code: z.string().min(1).max(64) }).parse(input))
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
  dueAt: z
    .string()
    .min(1)
    .max(64)
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date"),
  type: z.enum(["problem_set", "essay", "exam", "quiz", "reading", "other"]),
  estimatedHours: z.number().min(0).max(200),
  isHighStakes: z.boolean(),
});

export const upsertDueDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => dueDateInput.parse(input))
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
  .validator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("lecturer_delete_due_date", {
      _event_id: data.eventId,
    });
    if (error) throw publicError(error, "deleteDueDate");
    return { ok: true };
  });
