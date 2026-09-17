import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, Container, PageHeading } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyEvents, logActualHours } from "@/lib/crunch.functions";
import { formatDue } from "@/lib/workload";

export const Route = createFileRoute("/_authenticated/log-hours")({
  head: () => ({
    meta: [
      { title: "Log your hours — Crunch" },
      {
        name: "description",
        content:
          "Record how long each finished assignment actually took. One number per item, and your future estimates get sharper.",
      },
      { property: "og:title", content: "Log your hours — Crunch" },
      {
        property: "og:description",
        content: "One number per finished assignment. That is the whole form.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => ({ events: await getMyEvents() }),
  component: LogHours,
});

function LogHours() {
  const { events } = Route.useLoaderData();
  const router = useRouter();
  const now = Date.now();

  const pastEvents = events
    .filter((e) => new Date(e.dueAt).getTime() < now)
    .sort((a, b) => b.dueAt.localeCompare(a.dueAt));

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pastEvents.map((e) => [
        e.id,
        e.actualHoursLogged === null ? "" : String(e.actualHoursLogged),
      ]),
    ),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(pastEvents.map((e) => [e.id, e.actualHoursLogged !== null])),
  );

  async function commit(eventId: string) {
    const raw = (values[eventId] ?? "").trim();
    if (raw === "") return;
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours < 0 || hours > 200) {
      toast.error("Enter a number of hours between 0 and 200.");
      return;
    }
    setSaving(eventId);
    try {
      await logActualHours({ data: { eventId, hours } });
      setSaved((s) => ({ ...s, [eventId]: true }));
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save those hours.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <AppShell>
      <PageHeading
        eyebrow="Past due"
        title="How long did it take?"
        subtitle="Only you ever see these numbers. They tune your own estimates and nothing else."
      />

      <Container className="flex max-w-2xl flex-col gap-3">
        {pastEvents.length === 0 ? (
          <div className="surface-card animate-rise rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold">Nothing to log yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Once a due date has passed, it shows up here so you can record the hours it actually
              took.
            </p>
            <Button asChild className="mt-5 rounded-full">
              <Link to="/dashboard">Back to your weeks</Link>
            </Button>
          </div>
        ) : (
          pastEvents.map((event, i) => (
            <div
              key={event.id}
              className="surface-card animate-rise flex items-center justify-between gap-4 rounded-2xl p-4"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{event.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {event.courseCode} · {formatDue(event.dueAt)} · {event.estimatedHours} h est.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="decimal"
                  aria-label={`Actual hours for ${event.title}`}
                  placeholder="—"
                  value={values[event.id] ?? ""}
                  onChange={(e) => {
                    const next = e.target.value;
                    setValues((v) => ({ ...v, [event.id]: next }));
                    setSaved((s) => ({ ...s, [event.id]: false }));
                  }}
                  onBlur={() => void commit(event.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="h-11 w-20 text-center text-base"
                />
                <span className="text-sm text-muted-foreground">h</span>
                {saving === event.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : saved[event.id] ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <span className="h-4 w-4" />
                )}
              </div>
            </div>
          ))
        )}

        {pastEvents.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Saved when you leave the field. Leave anything blank if you would rather not log it.
          </p>
        ) : null}
      </Container>
    </AppShell>
  );
}
