import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  ChartNoAxesColumn,
  Layers,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { PageShell } from "@/components/site/PageShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Crunch — See Your Heavy Weeks Before They Land" },
      {
        name: "description",
        content:
          "Crunch reads your university calendar feed, scores how heavy each upcoming week is, and flags same-day high-stakes clashes across courses so you can plan ahead.",
      },
      { property: "og:title", content: "Crunch — See Your Heavy Weeks Before They Land" },
      {
        property: "og:description",
        content:
          "Workload awareness for university students: weekly effort scores, cross-course conflict warnings, and honest estimates that learn from your own logged hours.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const weeks = [
  { label: "This week", range: "25 – 31 Aug", hours: 6, level: "Light" as const },
  { label: "Next week", range: "1 – 7 Sep", hours: 13, level: "Moderate" as const },
  { label: "Week of", range: "8 – 14 Sep", hours: 21, level: "Heavy" as const },
  { label: "Week of", range: "15 – 21 Sep", hours: 32, level: "Brutal" as const },
];

const levelStyles = {
  Light: "bg-level-light text-level-light-foreground",
  Moderate: "bg-level-moderate text-level-moderate-foreground",
  Heavy: "bg-level-heavy text-level-heavy-foreground",
  Brutal: "bg-level-brutal text-level-brutal-foreground",
} as const;

const barWidth = { Light: "18%", Moderate: "40%", Heavy: "66%", Brutal: "100%" } as const;

const features = [
  {
    icon: CalendarClock,
    title: "One feed, every course",
    body: "Paste your Brightspace calendar subscription link once. Crunch keeps every course's due dates in sync from then on.",
  },
  {
    icon: Layers,
    title: "Weeks scored, not just listed",
    body: "Each upcoming week gets total estimated effort and a Light, Moderate, Heavy or Brutal reading — the sum no course page shows you.",
  },
  {
    icon: TriangleAlert,
    title: "Clashes surfaced early",
    body: "Two high-stakes deadlines on the same day across different courses gets its own warning, weeks before it arrives.",
  },
  {
    icon: ChartNoAxesColumn,
    title: "Estimates that learn from you",
    body: "Log what an assignment actually took. The rules-based model adjusts to your pace — no black-box AI claims.",
  },
];

function Landing() {
  return (
    <PageShell>
      {/* Hero */}
      <section className="grain-bg relative overflow-hidden border-b border-border/60">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
          <div>
            <span className="animate-fade inline-flex items-center gap-2 rounded-full border border-glass-border bg-glass px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-primary" />
              HIVE student innovation pilot
            </span>

            <h1 className="animate-rise mt-6 text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
              See the heavy week
              <br />
              <span className="text-primary">before it lands.</span>
            </h1>

            <p className="animate-rise mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Every course publishes its deadlines separately. Nobody publishes the sum. Crunch
              reads your university calendar feed, adds the weeks up, and shows you the shape of
              your semester in advance.
            </p>

            <div className="animate-rise mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full px-7 shadow-raised">
                <Link to="/auth">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>

              <Button size="lg" variant="ghost" className="rounded-full px-7" asChild>
                <Link to="/about">How the model works</Link>
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              For students and lecturers with a university email address.
            </p>
          </div>

          {/* Product preview */}
          <div className="animate-rise relative">
            <div className="glass-panel rounded-3xl p-4 shadow-float sm:p-5">
              <div className="flex items-center justify-between px-1 pb-4">
                <p className="font-display text-sm font-semibold">Upcoming weeks</p>
                <span className="text-xs text-muted-foreground">Semester 2</span>
              </div>

              <div className="flex flex-col gap-2.5">
                {weeks.map((week) => (
                  <div
                    key={week.range}
                    className="rounded-2xl border border-border/70 bg-surface p-4 shadow-soft transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-raised"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{week.range}</p>
                        <p className="text-xs text-muted-foreground">{week.label}</p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {week.hours}h
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${levelStyles[week.level]}`}
                        >
                          {week.level}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className={`h-full rounded-full ${levelStyles[week.level]}`}
                        style={{ width: barWidth[week.level] }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-start gap-3 rounded-2xl border border-glass-border bg-accent/60 p-4 backdrop-blur">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
                <div>
                  <p className="text-sm font-medium text-accent-foreground">
                    Two high-stakes deadlines on 18 Sep
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    CSC301 project submission and STA220 test fall on the same day.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <h2 className="max-w-xl text-2xl font-semibold sm:text-3xl">
          Built for the week you did not see coming.
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="surface-card rounded-2xl p-6 transition-shadow duration-300 hover:shadow-raised"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Lecturers */}
      <section className="border-y border-border/60 bg-surface-sunken">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              For lecturers
            </p>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
              See your cohort&apos;s load, never the individual.
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
              A heatmap of which weeks are heaviest across everyone taking your course — aggregated
              and anonymised, and withheld entirely for cohorts too small to stay anonymous. Add or
              adjust your own due dates in Crunch, and a future calendar sync will never overwrite
              them.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              No per-student drill-down. By design.
            </p>
          </div>

          <div className="grid grid-cols-6 gap-1.5 rounded-2xl border border-border/70 bg-surface p-4 shadow-soft sm:gap-2 sm:p-6">
            {[
              1, 1, 2, 2, 1, 3, 2, 3, 3, 2, 4, 3, 1, 2, 4, 4, 3, 2, 2, 1, 3, 4, 2, 1, 1, 2, 2, 3, 1,
              1,
            ].map((v, i) => (
              <div
                key={i}
                className={`aspect-square rounded-md ${
                  ["", "bg-level-light", "bg-level-moderate", "bg-level-heavy", "bg-level-brutal"][
                    v
                  ]
                }`}
                aria-hidden="true"
              />
            ))}
            <p className="col-span-6 pt-2 text-xs text-muted-foreground">
              Weeks 1–30, aggregate estimated effort across the cohort.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-20 text-center sm:py-28">
        <h2 className="mx-auto max-w-2xl text-2xl font-semibold sm:text-4xl">
          Stop finding out on Sunday night.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
          Connect your calendar feed once and Crunch keeps the rest of the semester in view.
        </p>
        <Button asChild size="lg" className="mt-8 rounded-full px-8 shadow-raised">
          <Link to="/auth">
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

      </section>
    </PageShell>
  );
}
