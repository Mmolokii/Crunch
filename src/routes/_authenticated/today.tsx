import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, Container } from "@/components/app/AppShell";
import { LevelBadge } from "@/components/app/WorkloadBits";
import { Button } from "@/components/ui/button";
import { getMyEvents } from "@/lib/crunch.functions";
import { formatDue, groupIntoWeeks, weekStartOf } from "@/lib/workload";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({
    meta: [
      { title: "Today & this week — Crunch" },
      {
        name: "description",
        content:
          "A fast, phone-first view of what is due in the next few days, with this week's workload reading at a glance.",
      },
      { property: "og:title", content: "Today & this week — Crunch" },
      {
        property: "og:description",
        content: "The between-classes view: what is due next, nothing else.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => ({ events: await getMyEvents() }),
  component: Today,
});

function Today() {
  const { events } = Route.useLoaderData();
  const now = new Date();
  const thisWeekStart = weekStartOf(now);
  const week = groupIntoWeeks(events, now).find((w) => w.weekStart === thisWeekStart) ?? null;

  const upcoming = events
    .filter((e) => !e.completed && new Date(e.dueAt).getTime() >= now.getTime())
    .slice(0, 6);

  const highStakesSoon = upcoming.some(
    (e) => e.isHighStakes && new Date(e.dueAt).getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000,
  );

  const todayLabel = now.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <AppShell>
      <Container className="flex max-w-xl flex-col gap-4 py-6">
        <div className="animate-fade">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{todayLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold">Next up</h1>
        </div>

        {week ? (
          <div className="surface-card animate-rise flex items-center justify-between rounded-2xl p-4">
            <div>
              <p className="text-sm text-muted-foreground">This week</p>
              <p className="font-display text-lg font-semibold">{week.totalHours} hours</p>
            </div>
            <LevelBadge level={week.level} className="px-3.5 py-1.5 text-sm" />
          </div>
        ) : null}

        {upcoming.length === 0 ? (
          <div className="surface-card animate-rise rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold">Nothing due yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Once your Brightspace feed is connected and synced, your next few due dates land here.
            </p>
            <Button asChild className="mt-5 rounded-full">
              <Link to="/onboarding">Connect your calendar</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {upcoming.map((event, i) => (
              <div
                key={event.id}
                className="surface-card animate-rise rounded-2xl p-4"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{event.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{event.courseCode}</p>
                  </div>
                  <span className="whitespace-nowrap rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                    {event.estimatedHours} h
                  </span>
                </div>
                <p className="mt-3 text-sm text-primary">{formatDue(event.dueAt)}</p>
              </div>
            ))}
          </div>
        )}

        {upcoming.length > 0 && !highStakesSoon ? (
          <p className="text-xs text-muted-foreground">
            Nothing high-stakes in the next seven days.
          </p>
        ) : null}
      </Container>
    </AppShell>
  );
}
