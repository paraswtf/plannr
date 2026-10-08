"use client";

import { Fragment, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { CourseSwatch } from "~/components/ui/course-swatch";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { type RouterOutputs } from "~/trpc/react";

/**
 * Attendance for the courses somebody teaches.
 *
 * One course at a time, because a roster is sixty names long and reading two at
 * once is not a thing anybody does. Which course to open is the decision the
 * tiles above are for, and they are ordered by trouble so the first one is
 * usually the right one.
 */

type Report = RouterOutputs["attendance"]["forCourse"];

export function CourseAttendance({ reports }: { reports: Report[] }) {
  // Worst first, the same rule the roster inside each course follows.
  const ordered = [...reports].sort(
    (a, b) => b.below - a.below || a.course.title.localeCompare(b.course.title),
  );
  const [courseId, setCourseId] = useState(ordered[0]?.course.id ?? "");
  const open =
    ordered.find((report) => report.course.id === courseId) ?? ordered[0];

  // A roster merges every group taking the course, so which division somebody
  // sits with is worth a line — but only when there is more than one of them.
  // The same word on all sixty rows tells a teacher nothing.
  const divisions = new Set(open?.students.flatMap((s) => s.groups) ?? []);

  if (!open) {
    return (
      <EmptyState icon="book" title="No courses to show">
        You are not the teacher on any lecture yet. A course appears here once
        the timetable puts your name on one of its sittings, which is also what
        lets you take its register.
      </EmptyState>
    );
  }

  const isShort = (percentage: number | null) =>
    percentage !== null && percentage < open.threshold;
  // The server sends the roster worst first with the never-marked last, so the
  // short students are always one run at the top. A heading over that run and
  // another over the rest does the grouping the 3px red stripe used to do (and
  // the stripe bent round the card's corner); with nobody short there is
  // nothing to split, and no headings.
  const anyShort = open.students.some((s) => isShort(s.percentage));

  return (
    <>
      {ordered.length > 1 && (
        /*
          A strip that scrolls sideways on a phone, a grid from `sm`. Stacked
          full width, four tiles cost a phone 430px before the first student;
          in a strip they cost one row, and the course in the most trouble is
          still the first one, already open. The strip runs out to the screen's
          edges (the negative margin undoes the page gutter) so a tile cut off
          at the right says there is more; the vertical padding keeps the
          tiles' shadows from being clipped by the scroller.
        */
        <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 py-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:overflow-visible sm:px-0">
          {ordered.map((report) => {
            const selected = report.course.id === open.course.id;
            return (
              <button
                key={report.course.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setCourseId(report.course.id)}
                className={`bg-surface plr-clip w-[220px] shrink-0 cursor-pointer snap-start rounded-[var(--radius-card)] p-3.5 text-left active:scale-[0.98] sm:w-auto ${
                  selected
                    ? "shadow-[inset_0_0_0_2px_var(--slate),var(--shadow-card)]"
                    : "hover:bg-surface-hover shadow-[var(--ring),var(--shadow-card)] hover:shadow-[var(--ring),var(--shadow-md)]"
                }`}
              >
                <span className="font-display text-title flex items-center gap-2 text-base font-semibold">
                  <CourseSwatch title={report.course.title} />
                  <span className="min-w-0 truncate">
                    {report.course.title}
                  </span>
                </span>
                {report.course.code ? (
                  <span className="text-faint mt-0.5 block font-mono text-xs">
                    {report.course.code}
                  </span>
                ) : (
                  <span className="text-faint mt-0.5 block text-xs">
                    No paper code
                  </span>
                )}
                <span className="mt-2.5 flex items-center gap-2">
                  <Badge tone={report.below > 0 ? "red" : "green"}>
                    {report.below > 0
                      ? `${report.below} below ${report.threshold}%`
                      : "All clear"}
                  </Badge>
                  <span className="text-muted text-xs tabular-nums">
                    {report.students.length}{" "}
                    {report.students.length === 1 ? "student" : "students"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Card pad={0}>
        {/* Stacked on a phone for the same reason the student's card is: a
            course title squeezed beside the count reads as a column of words. */}
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-6 sm:gap-y-2 sm:p-5">
          <div className="min-w-0">
            <h3 className="font-display text-title text-md font-semibold tracking-[-0.01em]">
              {open.course.title}
            </h3>
            <p className="text-muted mt-1 text-xs">
              {open.conducted === 0
                ? "No register taken yet"
                : `${open.conducted} ${open.conducted === 1 ? "register" : "registers"} taken`}{" "}
              · {open.scheduled} scheduled this semester
            </p>
          </div>
          <div className="sm:text-right">
            <div
              className={`font-display text-2xl leading-none font-semibold tracking-[-0.02em] tabular-nums ${
                open.below > 0 ? "text-bad" : "text-good"
              }`}
            >
              {open.below}
            </div>
            <div className="text-muted mt-1.5 text-xs">
              of {open.students.length} below {open.threshold}%
            </div>
          </div>
        </div>

        {open.students.length === 0 ? (
          <div className="shadow-[inset_0_1px_0_var(--hair-soft)]">
            <EmptyState compact icon="users" title="No students yet">
              No group taking this course has anybody in it yet.
            </EmptyState>
          </div>
        ) : (
          open.students.map((student, i) => {
            const short = isShort(student.percentage);
            const startsRest =
              anyShort &&
              !short &&
              (i === 0 || isShort(open.students[i - 1]!.percentage));
            return (
              <Fragment key={student.studentId}>
                {anyShort && i === 0 && short && (
                  <RosterHeading>Below {open.threshold}%</RosterHeading>
                )}
                {startsRest && <RosterHeading>Everyone else</RosterHeading>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 shadow-[inset_0_1px_0_var(--hair-soft)] sm:px-5">
                  {/*
                    Sixty of these are read one under the other looking for the
                    short ones, so on a phone the name takes its own line and the
                    two figures share the one below — the percentage still last
                    and still hard right, which is the column the eye runs down.
                  */}
                  <span className="w-full min-w-0 sm:w-auto sm:flex-1">
                    <span className="text-title block truncate text-base font-semibold">
                      {student.name}
                    </span>
                    <span className="text-faint block truncate font-mono text-xs">
                      {divisions.size > 1
                        ? `${student.prn} · ${student.groups.join(", ")}`
                        : student.prn}
                    </span>
                  </span>
                  <span className="text-muted flex-1 text-sm tabular-nums sm:w-[130px] sm:flex-none">
                    {student.attended} of {student.conducted} attended
                  </span>
                  <span
                    className={`w-[52px] shrink-0 text-right font-mono text-sm font-semibold tabular-nums ${
                      student.percentage === null
                        ? "text-faint"
                        : short
                          ? "text-bad"
                          : "text-good"
                    }`}
                  >
                    {student.percentage === null
                      ? "None"
                      : `${student.percentage}%`}
                  </span>
                </div>
              </Fragment>
            );
          })
        )}

        <p className="text-faint px-4 py-3 text-xs shadow-[inset_0_1px_0_var(--hair-soft)] sm:px-5">
          Percentages are over the registers taken, not over the{" "}
          {open.scheduled} lectures a group sits this semester. A student
          showing &ldquo;None&rdquo; has never appeared on a register for this
          course.
        </p>
      </Card>
    </>
  );
}

/** A label over a run of the roster: the short students, then the rest. */
function RosterHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="bg-tint-hover text-muted text-2xs px-4 py-1.5 font-semibold shadow-[inset_0_1px_0_var(--hair-soft)] sm:px-5">
      {children}
    </p>
  );
}
