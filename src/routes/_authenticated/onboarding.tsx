import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Check, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/site/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCalendarSource, getMyCourses, saveCalendarSource } from "@/lib/crunch.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Connect your calendar — Crunch" },
      {
        name: "description",
        content:
          "Paste your Brightspace calendar subscription link once and Crunch scores every upcoming week for you. Takes about a minute.",
      },
      { property: "og:title", content: "Connect your calendar — Crunch" },
      {
        property: "og:description",
        content: "One calendar link, and every upcoming week gets scored.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => ({ source: await getCalendarSource() }),
  component: Onboarding,
});

type State = "welcome" | "url" | "invalid" | "unreachable" | "syncing" | "empty" | "done";

const VALID = /^https?:\/\/[^\s]+\/d2l\/le\/calendar\/feed\/[^\s]+$/i;

type SyncedCourse = { id: string; code: string | null; name: string };

function Onboarding() {
  const { source } = Route.useLoaderData();
  const [state, setState] = useState<State>(source ? "url" : "welcome");
  const [url, setUrl] = useState(source?.icsUrl ?? "");
  const [courses, setCourses] = useState<SyncedCourse[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [errorNote, setErrorNote] = useState<string | null>(null);

  const save = useServerFn(saveCalendarSource);
  const loadCourses = useServerFn(getMyCourses);

  async function submit() {
    if (!VALID.test(url.trim())) {
      setState("invalid");
      return;
    }
    setState("syncing");
    setErrorNote(null);
    try {
      // saveCalendarSource calls runCalendarSync synchronously before
      // returning — this is a real result, not an inference from a
      // separate courses.length === 0 read. See docs/adr/0001-sync-pipeline.md.
      const result = await save({ data: { icsUrl: url.trim() } });

      if (result.status === "invalid_url") {
        setState("invalid");
        return;
      }
      if (result.status === "unreachable") {
        setState("unreachable");
        return;
      }
      if (result.status === "empty") {
        setState("empty");
        return;
      }

      setEventCount(result.eventsUpserted);
      setCourses(await loadCourses());
      setState("done");
    } catch (error) {
      setErrorNote(error instanceof Error ? error.message : "Something went wrong");
      setState("unreachable");
    }
  }

  return (
    <div className="grain-bg flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 py-6">
        <Logo />
        <span className="text-xs text-muted-foreground">
          Step {state === "welcome" ? 1 : 2} of 2
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-16">
        {state === "welcome" && (
          <section className="surface-card animate-rise rounded-3xl p-7">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent">
              <CalendarClock className="h-5 w-5 text-accent-foreground" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold">Let's find your heavy weeks</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Crunch reads your Brightspace calendar feed, adds up how much effort each upcoming
              week is likely to take, and warns you when two high-stakes deadlines land on the same
              day. Nothing is shared with your lecturers.
            </p>
            <ul className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Read-only — Crunch never
                writes to your calendar.
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Your feed URL is
                encrypted at rest.
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> You can disconnect it at
                any time in settings.
              </li>
            </ul>
            <Button className="mt-7 w-full rounded-full" onClick={() => setState("url")}>
              Get started
            </Button>
          </section>
        )}

        {(state === "url" || state === "invalid" || state === "unreachable") && (
          <section className="surface-card animate-rise rounded-3xl p-7">
            <h1 className="text-2xl font-semibold">Paste your calendar link</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              In Brightspace open <span className="text-foreground">Calendar → Subscribe</span> and
              copy the subscription URL.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <Label htmlFor="ics">Subscription URL</Label>
              <Input
                id="ics"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (state !== "url") setState("url");
                }}
                placeholder="https://brightspace.myemeris.edu.za/d2l/le/calendar/feed/…"
                aria-invalid={state === "invalid"}
              />
            </div>

            {state === "invalid" && (
              <Message
                tone="warn"
                title="That doesn't look like a Brightspace feed"
                body="The link should contain /d2l/le/calendar/feed/. Copy it straight from the Subscribe dialog rather than the page address bar."
              />
            )}
            {state === "unreachable" && (
              <Message
                tone="warn"
                title="We couldn't reach that feed"
                body={
                  errorNote ??
                  "Your link was saved, but we couldn't fetch that feed just now. Double check the URL, or wait for tonight's automatic sync to try again."
                }
              />
            )}

            <Button className="mt-6 w-full rounded-full" onClick={submit} disabled={!url.trim()}>
              Connect &amp; sync
            </Button>
          </section>
        )}

        {state === "syncing" && (
          <section className="surface-card animate-rise flex flex-col items-center rounded-3xl p-10 text-center">
            <span className="animate-breathe flex h-14 w-14 items-center justify-center rounded-full bg-accent">
              <Loader2 className="h-6 w-6 animate-spin text-accent-foreground" />
            </span>
            <h1 className="mt-6 text-xl font-semibold">Reading your calendar</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pulling due dates and grouping them by course. This usually takes a few seconds.
            </p>
          </section>
        )}

        {state === "empty" && (
          <section className="surface-card animate-rise rounded-3xl p-7">
            <h1 className="text-2xl font-semibold">Saved — no due dates yet</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your calendar link is stored, but no due dates have come through yet. That usually
              means your lecturers haven't added dates to Brightspace yet. Crunch will keep checking
              nightly and score your weeks as soon as anything appears.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="rounded-full">
                <Link to="/dashboard">Continue to dashboard</Link>
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => setState("url")}>
                Use a different link
              </Button>
            </div>
          </section>
        )}

        {state === "done" && (
          <section className="surface-card animate-rise rounded-3xl p-7">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent">
              <Check className="h-5 w-5 text-accent-foreground" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold">Found {courses.length} courses</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {eventCount} upcoming item{eventCount === 1 ? "" : "s"} synced. Check these look
              right.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {courses.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl bg-surface-sunken px-4 py-3"
                >
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.code}</span>
                </div>
              ))}
            </div>
            <Button asChild className="mt-7 w-full rounded-full">
              <Link to="/dashboard">See my weeks</Link>
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}

function Message({ tone, title, body }: { tone: "warn"; title: string; body: ReactNode }) {
  return (
    <div
      className="animate-fade mt-4 flex items-start gap-3 rounded-xl border border-glass-border bg-accent/50 p-4"
      data-tone={tone}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
