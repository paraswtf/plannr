"use client";

import { useState } from "react";

import { PageHeader } from "~/components/app/shell/page-header";
import { Card } from "~/components/ui/card";
import { Segmented } from "~/components/ui/segmented";
import { api, type RouterOutputs } from "~/trpc/react";
import { CourseAttendance } from "./course-attendance";
import { MyAttendance } from "./my-attendance";

/**
 * The attendance screen, for the two people who care about it: the student
 * checking whether they are alright, and the teacher looking for whoever is not.
 *
 * Both halves can belong to the same person — plenty of staff also study, and an
 * administrator has both profiles — so this is a switch rather than a fork on
 * role. Whoever has only one half never sees the switch.
 */

type Mine = RouterOutputs["attendance"]["mine"];
type Report = RouterOutputs["attendance"]["forCourse"];

export function AttendanceOverview({
  mine: initial,
  teaching,
}: {
  mine: Mine;
  teaching: Report[];
}) {
  // Kept here rather than inside MyAttendance because the header counts the
  // same courses the cards do. A teacher can take a register while this is open,
  // and one query means the verdict at the top can never disagree with the
  // cards under it.
  const { data: mine } = api.attendance.mine.useQuery(undefined, {
    initialData: initial,
    refetchOnWindowFocus: true,
  });

  const studies = mine.courses.length > 0;
  const teaches = teaching.length > 0;
  const [tab, setTab] = useState<"mine" | "teaching">("mine");

  // The switch only exists for somebody who has both halves. With one half the
  // tab state is irrelevant — that half is what they get.
  const showing = studies && teaches ? tab : teaches ? "teaching" : "mine";

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={
          showing === "teaching"
            ? summariseTeaching(teaching)
            : summariseMine(mine)
        }
      />

      <div className="px-9 pt-2 pb-10">
        {studies && teaches && (
          <div className="mb-5">
            <Segmented
              items={[
                { value: "mine" as const, label: "My attendance" },
                { value: "teaching" as const, label: "Courses I teach" },
              ]}
              value={tab}
              onChange={setTab}
              size="sm"
            />
          </div>
        )}

        {showing === "teaching" ? (
          <CourseAttendance reports={teaching} />
        ) : studies ? (
          <MyAttendance mine={mine} />
        ) : (
          <Card>
            <p className="text-muted m-0 text-[14px]">
              There is no attendance for you to read. Students see their own
              register here once they are in a group, and teachers see their
              courses once the timetable puts their name on a lecture.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

function summariseMine(mine: Mine): string {
  if (mine.courses.length === 0) return "Nothing to show yet";
  const short = mine.courses.filter(
    (course) => course.percentage !== null && course.percentage < mine.threshold,
  ).length;
  return short === 0
    ? `All ${mine.courses.length} courses at or above ${mine.threshold}%`
    : `${short} of ${mine.courses.length} courses below ${mine.threshold}%`;
}

/**
 * Counted in courses rather than in people: somebody short in two of your
 * courses is one student and two problems, and adding the per-course figures
 * together would report them as two students.
 */
function summariseTeaching(reports: Report[]): string {
  const first = reports[0];
  if (!first) return "Nothing to show yet";
  const { threshold } = first;
  const affected = reports.filter((report) => report.below > 0).length;
  const courses = `${reports.length} ${reports.length === 1 ? "course" : "courses"}`;
  return affected === 0
    ? `Nobody below ${threshold}% in your ${courses}`
    : `${affected} of your ${courses} ${affected === 1 ? "has" : "have"} somebody below ${threshold}%`;
}
