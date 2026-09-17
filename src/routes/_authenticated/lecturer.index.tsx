import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { AppShell, Container, PageHeading } from "@/components/app/AppShell";
import { LevelBadge } from "@/components/app/WorkloadBits";
import { getCohortWeeks, getLecturerCourses } from "@/lib/crunch.functions";
import { levelFill, levelFor, weekRangeLabel } from "@/lib/workload";

export const Route = createFileRoute("/_authenticated/lecturer/")({
  head: () => ({
    meta: [
      { title: "Cohort workload — Crunch for lecturers" },
      {
        name: "description",
        content:
          "An anonymised, aggregate picture of which weeks are heaviest across your cohort, so you can move a deadline before it collides with everything else.",
      },
      { property: "og:title", content: "Cohort workload — Crunch for lecturers" },
      {
        property: "og:description",
        content: "Aggregate-only workload across your cohort. No individual student is ever shown.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => {
    const courses = await getLecturerCourses();
    const first = courses[0];
    const cohort = first
      ? await getCohortWeeks({ data: { code: first.code } })
      : {
          minCohort: 8,
          weeks: [] as { weekStart: string; avgHours: number; studentCount: number }[],
        };
    return { courses, course: first ?? null, cohort };
  },
  component: LecturerCohort,
});

function LecturerCohort() {
  const { courses, course, cohort } = Route.useLoaderData();
  const max = Math.max(1, ...cohort.weeks.map((w) => w.avgHours));

  return (
    <AppShell role="lecturer">
      <PageHeading
        eyebrow={course ? `${course.code} · ${course.name}` : "Cohort"}
        title="Cohort workload"
        subtitle={
          course
            ? `Averaged across the students on ${course.code} who have connected a calendar feed. Aggregates are hidden entirely below ${cohort.minCohort} students.`
            : "No courses are linked to your account yet."
        }
      />

      <Container className="flex flex-col gap-5">
        <div className="animate-rise flex items-start gap-3 rounded-2xl border border-glass-border bg-accent/50 p-4 backdrop-blur-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
          <p className="text-sm leading-relaxed text-foreground/85">
            You are seeing cohort averages only. Crunch has no per-student view for lecturers, by
            design — individual workload is not shown without a consent flow that does not exist
            yet.
          </p>
        </div>

        {courses.length === 0 ? (
          <section className="surface-card animate-rise rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold">No courses linked yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Once your courses are linked to your lecturer account, cohort averages appear here.
            </p>
          </section>
        ) : cohort.weeks.length === 0 ? (
          <section className="surface-card animate-rise rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold">Cohort too small to show</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Crunch shows nothing at all until at least {cohort.minCohort} students on this course
              have connected a calendar feed — an average across a handful of students is close
              enough to naming them.
            </p>
          </section>
        ) : (
          <section className="surface-card animate-rise rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold">Heaviest weeks</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {cohort.weeks[0]?.studentCount} students in this cohort.
            </p>
            <div className="mt-6 flex flex-col gap-4">
              {cohort.weeks.map((w) => {
                const level = levelFor(w.avgHours);
                return (
                  <div key={w.weekStart}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{weekRangeLabel(w.weekStart)}</span>
                      <span className="flex items-center gap-3 text-muted-foreground">
                        {w.avgHours} h avg
                        <LevelBadge level={level} />
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className={`h-full rounded-full transition-[width] duration-700 ease-calm ${levelFill[level]}`}
                        style={{ width: `${(w.avgHours / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {course ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Want to shift a deadline out of a heavy week?{" "}
            <Link
              to="/lecturer/due-dates"
              className="text-primary underline-offset-4 hover:underline"
            >
              Manage your due dates
            </Link>
            .
          </p>
        ) : null}
      </Container>
    </AppShell>
  );
}
