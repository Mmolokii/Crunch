import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, Container, PageHeading } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteDueDate,
  getLecturerCourses,
  getLecturerDueDates,
  upsertDueDate,
} from "@/lib/crunch.functions";
import { formatDue } from "@/lib/workload";

const TYPES = ["problem_set", "essay", "exam", "quiz", "reading", "other"] as const;
type EventType = (typeof TYPES)[number];

const typeLabel: Record<EventType, string> = {
  problem_set: "Problem set",
  essay: "Essay",
  exam: "Test",
  quiz: "Quiz",
  reading: "Reading",
  other: "Other",
};

export const Route = createFileRoute("/_authenticated/lecturer/due-dates")({
  head: () => ({
    meta: [
      { title: "Manage due dates — Crunch for lecturers" },
      {
        name: "description",
        content:
          "Add, edit or remove due dates for your own course. Dates you set here are marked lecturer-set and survive every future calendar sync.",
      },
      { property: "og:title", content: "Manage due dates — Crunch for lecturers" },
      {
        property: "og:description",
        content: "Lecturer-set due dates that a calendar re-sync will never overwrite.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => {
    const courses = await getLecturerCourses();
    const course = courses[0] ?? null;
    const dueDates = course ? await getLecturerDueDates({ data: { code: course.code } }) : [];
    return { course, dueDates };
  },
  component: LecturerDueDates,
});

type Draft = {
  eventId: string | null;
  courseId: string;
  title: string;
  dueAt: string;
  type: EventType;
  estimatedHours: string;
  isHighStakes: boolean;
};

function LecturerDueDates() {
  const { course, dueDates } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(upsertDueDate);
  const remove = useServerFn(deleteDueDate);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  function newDraft() {
    if (!course) return;
    setDraft({
      eventId: null,
      courseId: course.courseId,
      title: "",
      dueAt: "",
      type: "problem_set",
      estimatedHours: "2",
      isHighStakes: false,
    });
  }

  async function submit() {
    if (!draft) return;
    setBusy(true);
    try {
      await save({
        data: {
          courseId: draft.courseId,
          eventId: draft.eventId,
          title: draft.title.trim(),
          dueAt: draft.dueAt,
          type: draft.type,
          estimatedHours: Number(draft.estimatedHours) || 0,
          isHighStakes: draft.isHighStakes,
        },
      });
      toast.success(draft.eventId ? "Due date updated." : "Due date added.");
      setDraft(null);
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save that due date.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(eventId: string) {
    try {
      await remove({ data: { eventId } });
      toast.success("Due date removed.");
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove that due date.");
    }
  }

  return (
    <AppShell role="lecturer">
      <PageHeading
        eyebrow={course ? `${course.code} · ${course.name}` : "Your course"}
        title="Due dates"
        subtitle="Anything you add here is marked lecturer-set, so a future Brightspace sync will never quietly overwrite it."
        action={
          course ? (
            <Button className="rounded-full" onClick={newDraft}>
              <Plus className="h-4 w-4" />
              Add due date
            </Button>
          ) : undefined
        }
      />

      <Container className="flex flex-col gap-3">
        {!course && (
          <div className="surface-card animate-rise rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold">No courses linked yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Once your courses are linked to your lecturer account, you can set due dates here.
            </p>
          </div>
        )}

        {draft && (
          <div className="surface-card animate-rise flex flex-col gap-4 rounded-2xl p-5">
            <h2 className="font-display text-lg font-semibold">
              {draft.eventId ? "Edit due date" : "New due date"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Practical test 2"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="due">Due</Label>
                <Input
                  id="due"
                  type="datetime-local"
                  value={draft.dueAt}
                  onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as EventType })}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="hours">Estimated hours</Label>
                <Input
                  id="hours"
                  type="number"
                  min={0}
                  max={200}
                  step="0.5"
                  value={draft.estimatedHours}
                  onChange={(e) => setDraft({ ...draft, estimatedHours: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:mt-8">
                <input
                  type="checkbox"
                  checked={draft.isHighStakes}
                  onChange={(e) => setDraft({ ...draft, isHighStakes: e.target.checked })}
                />
                High stakes
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="rounded-full"
                onClick={submit}
                disabled={busy || !draft.title.trim() || !draft.dueAt}
              >
                {busy ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" className="rounded-full" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {course && dueDates.length === 0 && !draft && (
          <div className="surface-card animate-rise rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold">No due dates yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Add one and it appears in your students' week scores straight away.
            </p>
          </div>
        )}

        {dueDates.map((item, i) => (
          <div
            key={item.id}
            className="surface-card animate-rise flex flex-col gap-3 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{item.title}</p>
                {item.isHighStakes && (
                  <span className="rounded-full bg-level-heavy px-2 py-0.5 text-[11px] font-medium text-level-heavy-foreground">
                    High stakes
                  </span>
                )}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                  {item.source === "manual" ? "Lecturer-set" : "From calendar feed"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDue(item.dueAt)} · {item.estimatedHours} h estimated
              </p>
            </div>
            {item.source === "manual" ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() =>
                    setDraft({
                      eventId: item.id,
                      courseId: item.courseId,
                      title: item.title,
                      dueAt: new Date(item.dueAt).toISOString().slice(0, 16),
                      type: (TYPES as readonly string[]).includes(item.type)
                        ? (item.type as EventType)
                        : "other",
                      estimatedHours: String(item.estimatedHours),
                      isHighStakes: item.isHighStakes,
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-destructive"
                  onClick={() => onRemove(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Synced — edit in Brightspace</span>
            )}
          </div>
        ))}

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Students see these dates in their own week scores immediately. They never see who else is
          in the cohort, and you never see an individual student's workload.
        </p>
      </Container>
    </AppShell>
  );
}
