import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, Container, PageHeading } from "@/components/app/AppShell";
import { ConflictCallout, IntensityBar, LevelBadge } from "@/components/app/WorkloadBits";
import { Button } from "@/components/ui/button";
import { getCalendarSource, getMyEvents } from "@/lib/crunch.functions";
import { groupIntoWeeks } from "@/lib/workload";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your workload weeks — Crunch" },
      {
        name: "description",
        content:
          "A rolling view of your upcoming university weeks, each scored by total estimated effort, with same-day high-stakes clashes flagged separately.",
      },
      { property: "og:title", content: "Your workload weeks — Crunch" },
      {
        property: "og:description",
        content: "Upcoming weeks scored Light to Brutal, with cross-course clash warnings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => ({
    events: await getMyEvents(),
    source: await getCalendarSource(),
  }),
  component: Dashboard,
});

function Dashboard() {
  const { events, source } = Route.useLoaderData();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const weeks = groupIntoWeeks(events);
  const allConflicts = weeks.flatMap((w) => w.conflicts);

  async function refresh() {
    setRefreshing(true);
    try {
      await router.invalidate();
      toast.success("Refreshed from your calendar data");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AppShell>
      <PageHeading
        eyebrow="Semester 2 · 2026"
        title="The weeks ahead"
        subtitle="Total estimated effort per week, drawn from your synced calendar feed and adjusted by the hours you log."
        action={
          <Button variant="outline" className="rounded-full" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
        }
      />

      <Container className="flex flex-col gap-6">
        <ConflictCallout conflicts={allConflicts} />

        {weeks.length === 0 ? (
          <div className="surface-card animate-rise rounded-2xl p-7">
            <h2 className="font-display text-lg font-semibold">No due dates yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {source
                ? "Your calendar feed is connected, but no due dates have come through yet. Crunch checks nightly and will score your weeks as soon as anything appears."
                : "Connect your Brightspace calendar feed and Crunch will start scoring your weeks."}
            </p>
            <Button asChild className="mt-6 rounded-full">
              <Link to="/onboarding">
                {source ? "Change calendar link" : "Connect calendar"}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {weeks.map((week, i) => (
              <Link
                key={week.weekStart}
                to="/week/$weekStart"
                params={{ weekStart: week.weekStart }}
                className="surface-card animate-rise group rounded-2xl p-5 transition-all duration-300 ease-calm hover:-translate-y-0.5 hover:shadow-raised"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {week.label}
                    </p>
                    <p className="font-display mt-1 text-lg font-semibold">{week.range}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <LevelBadge level={week.level} />
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 ease-calm group-hover:translate-x-1" />
                  </div>
                </div>

                <div className="mt-4">
                  <IntensityBar level={week.level} hours={week.totalHours} />
                </div>

                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <span>{week.totalHours} hours estimated</span>
                  <span>
                    {week.events.length} item{week.events.length === 1 ? "" : "s"}
                    {week.conflicts.length > 0 && " · clash flagged"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Estimates come from a rules-based model using assessment type and weighting, tuned by the
          hours you log yourself. They are guidance, not a prediction.
        </p>
      </Container>
    </AppShell>
  );
}
