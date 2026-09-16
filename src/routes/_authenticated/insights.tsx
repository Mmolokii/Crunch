import { createFileRoute, Link } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";

import { AppShell, Container, PageHeading } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { getMyEvents } from "@/lib/crunch.functions";
import {
  courseSplitOf,
  groupIntoWeeks,
  insightsFrom,
  levelFill,
  typeAccuracyOf,
} from "@/lib/workload";

const typeLabel: Record<string, string> = {
  problem_set: "Problem set",
  essay: "Essay",
  exam: "Test",
  quiz: "Quiz",
  reading: "Reading",
  other: "Other",
};

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Semester insights — Crunch" },
      {
        name: "description",
        content:
          "Your whole semester at once: workload by week, split by course and assessment type, and how your estimates compare to the hours you actually logged.",
      },
      { property: "og:title", content: "Semester insights — Crunch" },
      {
        property: "og:description",
        content: "Estimated versus actual hours, by course and by assessment type.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => ({ events: await getMyEvents() }),
  component: Insights,
});

function Insights() {
  const { events } = Route.useLoaderData();
  const weeks = groupIntoWeeks(events);
  const courseSplit = courseSplitOf(events);
  const typeAccuracy = typeAccuracyOf(events);
  const callouts = insightsFrom(weeks, events);
  const max = Math.max(1, ...weeks.map((w) => w.totalHours));
  const scale = Math.max(1, ...typeAccuracy.flatMap((t) => [t.estimated, t.actual]));

  return (
    <AppShell>
      <PageHeading
        eyebrow="Your semester"
        title="Insights"
        subtitle="A rules-based model, tuned by the hours you log. Not a black box — every number below traces back to your own calendar and your own logging."
      />

      <Container className="flex flex-col gap-5">
        {weeks.length === 0 ? (
          <section className="surface-card animate-rise rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold">Nothing to chart yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Connect your Brightspace feed and Crunch will chart every week of your semester here.
            </p>
            <Button asChild className="mt-5 rounded-full">
              <Link to="/onboarding">Connect your calendar</Link>
            </Button>
          </section>
        ) : (
          <>
            <section className="surface-card animate-rise rounded-2xl p-6">
              <h2 className="font-display text-lg font-semibold">Every week of the semester</h2>
              <div className="mt-6 flex h-48 items-end gap-2 sm:gap-3">
                {weeks.map((w) => (
                  <div
                    key={w.weekStart}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                  >
                    <span className="text-[11px] text-muted-foreground">{w.totalHours}</span>
                    <div
                      className={`w-full rounded-t-lg transition-[height] duration-700 ease-calm ${levelFill[w.level]}`}
                      style={{ height: `${(w.totalHours / max) * 100}%` }}
                    />
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {w.range.split(" ")[0]}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-3">
              {callouts.map((text, i) => (
                <div
                  key={text}
                  className="animate-rise flex items-start gap-3 rounded-2xl border border-glass-border bg-accent/50 p-4 backdrop-blur-sm"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
                  <p className="text-sm leading-relaxed text-foreground/85">{text}</p>
                </div>
              ))}
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="surface-card animate-rise rounded-2xl p-6">
                <h2 className="font-display text-lg font-semibold">Where the hours go</h2>
                <div className="mt-5 flex flex-col gap-4">
                  {courseSplit.map((c) => (
                    <div key={c.code}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{c.hours} h</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${c.share}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="surface-card animate-rise rounded-2xl p-6">
                <h2 className="font-display text-lg font-semibold">Estimated vs actual</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Average hours per item, by assessment type.
                </p>
                {typeAccuracy.length === 0 ? (
                  <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                    Nothing logged yet. Once you record actual hours on a few items, this compares
                    them against Crunch's estimates.
                  </p>
                ) : (
                  <div className="mt-5 flex flex-col gap-4">
                    {typeAccuracy.map((t) => (
                      <div key={t.type}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="font-medium">{typeLabel[t.type] ?? t.type}</span>
                          <span className="text-muted-foreground">
                            {t.estimated} h est · {t.actual} h actual
                          </span>
                        </div>
                        <div className="mt-2 flex flex-col gap-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                            <div
                              className="h-full rounded-full bg-level-moderate"
                              style={{ width: `${(t.estimated / scale) * 100}%` }}
                            />
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${(t.actual / scale) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Crunch scores weeks with a fixed set of rules — assessment type, weighting, and how close
          together deadlines fall. There is no predictive model here, and no data leaves your
          account.
        </p>
      </Container>
    </AppShell>
  );
}
