"use client";

import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
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
      <Card>
        <p className="text-muted m-0 text-[14px]">
          You are not the teacher on any lecture yet. A course appears here once
          the timetable puts your name on one of its sittings — which is also
          what lets you take its register.
        </p>
      </Card>
    );
  }

  return (
    <>
      {ordered.length > 1 && (
        <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4">
          {ordered.map((report) => {
            const selected = report.course.id === open.course.id;
            return (
              <button
                key={report.course.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setCourseId(report.course.id)}
                className="bg-surface plr-clip cursor-pointer rounded-[var(--radius-card)] p-4 text-left"
                style={{
                  boxShadow: selected
                    ? "inset 0 0 0 2px var(--slate), var(--shadow-card)"
                    : "var(--ring), var(--shadow-card)",
                }}
              >
                <span className="font-display text-title block truncate text-[15px] font-bold">
                  {report.course.title}
                </span>
                <span className="text-faint mt-0.5 block font-mono text-[11.5px]">
                  {report.course.code ?? "no paper code"}
                </span>
                <span className="mt-2.5 flex items-center gap-2">
                  <Badge tone={report.below > 0 ? "red" : "green"} dot>
                    {report.below > 0
                      ? `${report.below} below ${report.threshold}%`
                      : "all clear"}
                  </Badge>
                  <span className="text-muted text-[11.5px]">
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
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 p-5">
          <div className="min-w-0">
            <h3 className="font-display text-title m-0 text-[17px] font-bold">
              {open.course.title}
            </h3>
            <p className="text-muted mt-1 mb-0 text-[12.5px]">
              {open.conducted === 0
                ? "No register taken yet"
                : `${open.conducted} ${open.conducted === 1 ? "register" : "registers"} taken`}{" "}
              · {open.scheduled} scheduled this semester
            </p>
          </div>
          <div className="text-right">
            <div
              className="font-display text-[30px] leading-none font-bold tracking-[-0.02em]"
              style={{
                color: open.below > 0 ? "var(--red)" : "var(--green)",
              }}
            >
              {open.below}
            </div>
            <div className="text-muted mt-1.5 text-[12.5px]">
              of {open.students.length} below {open.threshold}%
            </div>
          </div>
        </div>

        {open.students.length === 0 ? (
          <p
            className="text-muted m-0 px-5 py-6 text-[14px]"
            style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
          >
            No group taking this course has anybody in it yet.
          </p>
        ) : (
          open.students.map((student) => {
            const short =
              student.percentage !== null && student.percentage < open.threshold;
            return (
              <div
                key={student.studentId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5"
                style={{
                  boxShadow: short
                    ? "inset 0 1px 0 var(--hair-soft), inset 3px 0 0 var(--red)"
                    : "inset 0 1px 0 var(--hair-soft)",
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-title block truncate text-[13.5px] font-semibold">
                    {student.name}
                  </span>
                  <span className="text-faint block truncate font-mono text-[11.5px]">
                    {divisions.size > 1
                      ? `${student.prn} · ${student.groups.join(", ")}`
                      : student.prn}
                  </span>
                </span>
                <span className="text-muted w-[130px] shrink-0 text-[12.5px]">
                  {student.attended} of {student.conducted} attended
                </span>
                <span
                  className="w-[52px] shrink-0 text-right font-mono text-[13px] font-bold"
                  style={{
                    color:
                      student.percentage === null
                        ? "var(--faint)"
                        : short
                          ? "var(--red)"
                          : "var(--green)",
                  }}
                >
                  {student.percentage === null ? "—" : `${student.percentage}%`}
                </span>
              </div>
            );
          })
        )}

        <p
          className="text-faint m-0 px-5 py-3 text-[12px]"
          style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
        >
          Percentages are over the registers taken, not over the{" "}
          {open.scheduled} lectures a group sits this semester. A student showing
          “—” has never appeared on a register for this course.
        </p>
      </Card>
    </>
  );
}
