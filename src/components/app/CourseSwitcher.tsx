import { Label } from "@/components/ui/label";
import { courseOptionLabel, type LecturerCourse } from "@/lib/lecturer-course";

/** Course picker for lecturers linked to more than one course (CRU-53). */
export function CourseSwitcher({
  courses,
  selected,
  minCohort,
  onSelect,
}: {
  courses: readonly LecturerCourse[];
  selected: LecturerCourse;
  minCohort?: number;
  onSelect: (code: string) => void;
}) {
  if (courses.length < 2) return null;

  return (
    <div className="animate-rise flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <Label htmlFor="course" className="shrink-0">
        Course
      </Label>
      <select
        id="course"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-md"
        value={selected.code}
        onChange={(e) => onSelect(e.target.value)}
      >
        {courses.map((c) => (
          <option key={c.code} value={c.code}>
            {courseOptionLabel(c, minCohort)}
          </option>
        ))}
      </select>
    </div>
  );
}
