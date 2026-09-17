import { TriangleAlert } from "lucide-react";

import { levelBadge, levelFill, type AppEvent, type Level, formatDue } from "@/lib/workload";
import { cn } from "@/lib/utils";

export function LevelBadge({ level, className }: { level: Level; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        levelBadge[level],
        className,
      )}
    >
      {level}
    </span>
  );
}

export function IntensityBar({ level, hours }: { level: Level; hours: number }) {
  const pct = Math.min(100, Math.round((hours / 34) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-calm",
          levelFill[level],
        )}
        style={{ width: `${Math.max(6, pct)}%` }}
      />
    </div>
  );
}

export function ConflictCallout({ conflicts }: { conflicts: { date: string; note: string }[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="animate-rise rounded-2xl border border-glass-border bg-accent/60 p-5 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
          <TriangleAlert className="h-4 w-4 text-accent-foreground" />
        </span>
        <div>
          <h3 className="font-display text-sm font-semibold text-accent-foreground">
            Same-day high-stakes clash{conflicts.length > 1 ? "es" : ""}
          </h3>
          <ul className="mt-2 flex flex-col gap-2">
            {conflicts.map((c) => (
              <li key={c.date} className="text-sm leading-relaxed text-foreground/80">
                <span className="font-medium text-foreground">{c.date}</span> — {c.note}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const typeLabel: Record<string, string> = {
  problem_set: "Problem set",
  essay: "Essay",
  exam: "Test",
  quiz: "Quiz",
  reading: "Reading",
  other: "Other",
  // legacy/demo values
  assignment: "Assignment",
  project: "Project",
  lab: "Lab",
};

export function EventRow({ event, action }: { event: AppEvent; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{event.title}</p>
          {event.isHighStakes && (
            <span className="rounded-full bg-level-heavy px-2 py-0.5 text-[11px] font-medium text-level-heavy-foreground">
              High stakes
            </span>
          )}
          {event.source === "manual" && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
              Lecturer-set
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {event.courseCode} · {typeLabel[event.type] ?? event.type} · {formatDue(event.dueAt)}
        </p>
      </div>
      <div className="flex items-center gap-4 sm:justify-end">
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {event.estimatedHours} h est.
        </span>
        {action}
      </div>
    </div>
  );
}
