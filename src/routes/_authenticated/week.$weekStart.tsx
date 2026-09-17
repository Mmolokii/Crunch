import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AppShell, Container, PageHeading } from "@/components/app/AppShell";
import { ConflictCallout, EventRow, IntensityBar, LevelBadge } from "@/components/app/WorkloadBits";
import { getMyEvents } from "@/lib/crunch.functions";
import { groupIntoWeeks, levelFor, weekLabelFor, weekRangeLabel } from "@/lib/workload";

export const Route = createFileRoute("/_authenticated/week/$weekStart")({
  head: () => ({
    meta: [
      { title: "Week detail — Crunch" },
      {
        name: "description",
        content:
          "Every assessment contributing to this week's workload score: type, estimated hours, high-stakes flag and any same-day clash.",
      },
      { property: "og:title", content: "Week detail — Crunch" },
      {
        property: "og:description",
        content: "What makes this university week as heavy as it is, item by item.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => ({ events: await getMyEvents() }),
  component: WeekDetail,
});

function WeekDetail() {
  const { weekStart } = Route.useParams();
  const { events } = Route.useLoaderData();

  const week = groupIntoWeeks(events).find((w) => w.weekStart === weekStart) ?? {
    weekStart,
    label: weekLabelFor(weekStart),
    range: weekRangeLabel(weekStart),
    totalHours: 0,
    level: levelFor(0),
    events: [],
    conflicts: [],
  };

  return (
    <AppShell>
      <PageHeading
        eyebrow={`${week.label} · ${week.totalHours} hours estimated`}
        title={week.range}
        subtitle="Everything that feeds this week's score. Estimated hours reflect your own logged pace where you have logged it."
        action={<LevelBadge level={week.level} className="px-4 py-1.5 text-sm" />}
      />

      <Container className="flex flex-col gap-6">
        <Link
          to="/dashboard"
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All weeks
        </Link>

        <div className="surface-card animate-rise rounded-2xl p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Week intensity</span>
            <span>{week.totalHours} h</span>
          </div>
          <div className="mt-3">
            <IntensityBar level={week.level} hours={week.totalHours} />
          </div>
        </div>

        <ConflictCallout conflicts={week.conflicts} />

        <section className="surface-card animate-rise rounded-2xl px-5 py-1">
          {week.events.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nothing is due in this week.</p>
          ) : (
            <div className="divide-y divide-border/70">
              {week.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      </Container>
    </AppShell>
  );
}
