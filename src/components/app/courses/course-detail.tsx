"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { KIND_LABEL, KIND_TONE } from "~/components/app/groups/group-vocab";
import { CourseSwatch } from "~/components/ui/course-swatch";
import { facultyCard, groupCard } from "~/components/app/people/entity-cards";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import {
  EntityPicker,
  initialsOf,
  pickerPage,
  useDebounced,
} from "~/components/ui/entity-picker";
import { Stat } from "~/components/ui/stat";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { api, type RouterOutputs } from "~/trpc/react";
import { countLabel, NO_FACULTY_NOTE } from "./course-vocab";

type Course = RouterOutputs["courses"]["byId"];

/**
 * One subject: who may teach it, who sits for it, and when it meets.
 *
 * A student or a lecturer opens this to read three lists, so those stay plain
 * text. Changing them is a coordinator's job, and only their view swaps the
 * lists for the pickers that edit them.
 */
export function CourseDetail({
  courseId,
  initial,
  canManage,
}: {
  courseId: string;
  initial: Course;
  canManage: boolean;
}) {
  const { data } = api.courses.byId.useQuery(
    { courseId },
    { initialData: initial },
  );
  const course = data ?? initial;

  // Lectures are series; sittings are the individual hours they expand to,
  // which is what a register is taken against.
  const sittings = course.events.reduce(
    (n, event) => n + event._count.occurrences,
    0,
  );

  return (
    <>
      <PageHeader
        title={course.title}
        subtitle={
          // The colour this course is drawn in everywhere else, at the one
          // place its name is the heading rather than a row in a list.
          <span className="flex items-center gap-2">
            <CourseSwatch title={course.title} />
            <span className="min-w-0 truncate">
              {[course.code, course.programme?.name, course.semester.name]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        }
        actions={
          <Link
            href="/courses"
            className="text-muted inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          >
            All courses
          </Link>
        }
      />

      <div className="px-4 pt-2 pb-8 sm:px-6 lg:px-9 lg:pb-10">
        {/* auto-fit alone is not safe here: its minmax floor is a hard minimum,
            so a track wider than a phone would push the document sideways. The
            single column below sm is what stops that. */}
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
          <Stat
            label="Students"
            value={course.headcount}
            note={`across ${countLabel(course.groups.length, "group")}`}
            icon="users"
            tone="green"
          />
          <Stat
            label="Cleared to teach"
            value={course.faculty.length}
            note={
              course.faculty.length === 0
                ? "cannot be timetabled yet"
                : "any of them may take a lecture"
            }
            icon="users"
            tone={course.faculty.length === 0 ? "red" : "violet"}
          />
          <Stat
            label="Lectures"
            value={course.events.length}
            note={`${countLabel(sittings, "sitting")} scheduled`}
            icon="calendar"
          />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
          <Card title="Who may teach it">
            {canManage ? (
              <FacultyEditor course={course} />
            ) : course.faculty.length === 0 ? (
              <p className="m-0 text-[13px] font-medium text-[#b02636]">
                {NO_FACULTY_NOTE}
              </p>
            ) : (
              <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                {course.faculty.map((teacher) => (
                  <span
                    key={teacher.id}
                    className="text-muted inline-flex items-center gap-2 text-[13px]"
                  >
                    <span
                      // Held to its size the way the picker's avatars are:
                      // without it a long name squeezes the circle into an
                      // oval on a phone, since the initials inside are half
                      // the width the ring is drawn at.
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: "var(--slate)" }}
                    >
                      {initialsOf(teacher.name)}
                    </span>
                    {teacher.name}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Which groups take it"
            action={
              <span className="text-faint font-mono text-[12px]">
                {countLabel(course.headcount, "student")}
              </span>
            }
          >
            {canManage ? (
              <GroupsEditor course={course} />
            ) : course.groups.length === 0 ? (
              <p className="text-muted m-0 text-[13px]">
                No group takes this course yet, so nobody is enrolled in it.
              </p>
            ) : (
              <div className="flex flex-col">
                {course.groups.map((group) => (
                  <div
                    key={group.id}
                    // A group's name is the whole point of the row, and beside
                    // a badge and a headcount there are only ~140px left for it
                    // on a phone, so it takes the line to itself there.
                    className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2 sm:flex-nowrap sm:py-1.5"
                  >
                    <span className="text-title w-full min-w-0 truncate text-[13px] font-semibold sm:w-auto sm:flex-1">
                      {group.name}
                    </span>
                    <Badge tone={KIND_TONE[group.kind]}>
                      {KIND_LABEL[group.kind]}
                    </Badge>
                    <span className="text-faint shrink-0 font-mono text-[12px] sm:w-[80px] sm:text-right">
                      {countLabel(group.students, "student")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Lectures events={course.events} />
      </div>
    </>
  );
}

/**
 * The teachers cleared to take this course.
 *
 * Saved on every change rather than behind a button: the picker is the list,
 * and `setFaculty` replaces it wholesale. Dropping someone leaves the lectures
 * they have already been timetabled to alone.
 */
function FacultyEditor({ course }: { course: Course }) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const utils = api.useUtils();
  const router = useRouter();

  const faculty = api.groups.facultyList.useQuery({
    query: useDebounced(query) || undefined,
    pageSize,
    // Pins whoever is already on the list so a search cannot hide them.
    includeIds: course.faculty.map((f) => f.id),
  });

  const setFaculty = api.courses.setFaculty.useMutation({
    onSuccess: async () => {
      setError(null);
      await utils.courses.invalidate();
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="flex flex-col gap-2.5">
      {error && <ErrorNote message={error} />}
      <EntityPicker
        selected={course.faculty.map((f) =>
          facultyCard({ id: f.id, name: f.name }),
        )}
        onChange={(facultyIds) =>
          setFaculty.mutate({ courseId: course.id, facultyIds })
        }
        page={pickerPage(faculty.data, (rows) => rows.map(facultyCard))}
        loading={faculty.isLoading}
        query={query}
        onQueryChange={setQuery}
        onLoadMore={() => setPageSize((n) => n + 20)}
        placeholder="Search faculty by name or department…"
        emptyLabel="Nobody yet"
        listId="course-faculty"
      />
      <span className="text-faint text-[11.5px]">
        {course.faculty.length === 0
          ? NO_FACULTY_NOTE
          : "Only the teacher a lecture is timetabled to can take its register."}
      </span>
    </div>
  );
}

/** The groups sitting for this course — which is what enrols their students. */
function GroupsEditor({ course }: { course: Course }) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const utils = api.useUtils();
  const router = useRouter();

  const groups = api.groups.list.useQuery({
    query: useDebounced(query) || undefined,
    pageSize,
    includeIds: course.groups.map((g) => g.id),
  });

  const setGroups = api.courses.setGroups.useMutation({
    onSuccess: async () => {
      setError(null);
      await utils.courses.invalidate();
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="flex flex-col gap-2.5">
      {error && <ErrorNote message={error} />}
      <EntityPicker
        selected={course.groups.map((g) => ({
          id: g.id,
          label: g.name,
          hint: countLabel(g.students, "student"),
        }))}
        onChange={(groupIds) =>
          setGroups.mutate({ courseId: course.id, groupIds })
        }
        page={pickerPage(groups.data, (rows) => rows.map(groupCard))}
        loading={groups.isLoading}
        query={query}
        onQueryChange={setQuery}
        onLoadMore={() => setPageSize((n) => n + 20)}
        placeholder="Search groups by name or programme…"
        emptyLabel="No group takes it yet"
        listId="course-groups"
      />
      <span className="text-faint text-[11.5px]">
        Adding a group enrols everyone in it — there is no separate enrolment
        list.
      </span>
    </div>
  );
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  timeZone: DEFAULT_TIMEZONE,
});

/**
 * When a lecture meets, in the terms it was scheduled in.
 *
 * A weekly series is a weekday — its `startTime` is only the first sitting, and
 * printing that date makes a slot that runs all term look like a one-off in
 * July. The weekday is safe to read off the first sitting because every rule the
 * app writes is a plain FREQ=WEEKLY with no BYDAY, so the series never moves off
 * the day it starts on. Anything else — a daily repeat, or a rule typed by hand
 * — keeps the date, which is at least true.
 */
function whenLabel(event: Course["events"][number]): string {
  const weekly = event.rrule && /(^|;)FREQ=WEEKLY(;|$)/i.test(event.rrule);
  return weekly
    ? `${WEEKDAY.format(event.startTime)}s`
    : formatDayLabel(event.startTime, DEFAULT_TIMEZONE);
}

/**
 * When the course meets. A weekly lecture is one row with its sitting count,
 * not twelve rows: the register is where individual hours belong.
 */
function Lectures({ events }: { events: Course["events"] }) {
  if (events.length === 0) {
    return (
      <Card title="Lectures">
        <p className="text-muted m-0 text-[13.5px]">
          Nothing is timetabled for this course yet.
        </p>
      </Card>
    );
  }

  return (
    <Card pad={0}>
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3"
        style={{ boxShadow: "inset 0 -1px 0 var(--hair-soft)" }}
      >
        <span className="font-display text-title text-[15px] font-bold">
          Lectures
        </span>
        <span className="text-muted text-[12.5px]">
          {events.length} series on the timetable
        </span>
      </div>

      {events.map((event, i) => (
        <div
          key={event.id}
          // Six columns come to nearly 600px of fixed width, so on a phone the
          // row becomes three lines — when it meets, who it is for, and who and
          // where — and only flattens into columns once there is room. Grouping
          // the columns in pairs of spans is what lets the same markup do both;
          // the inner gap matches the outer one, so at sm the grouping cannot
          // be seen.
          className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 sm:py-2.5"
          style={
            i > 0 ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" } : undefined
          }
        >
          <span className="flex shrink-0 items-center gap-3">
            <span className="text-title font-mono text-[12px] font-bold sm:w-[104px]">
              {whenLabel(event)}
            </span>
            <span className="text-muted font-mono text-[12px] sm:w-[116px]">
              {formatHourLabel(event.startTime, DEFAULT_TIMEZONE)}–
              {formatHourLabel(event.endTime, DEFAULT_TIMEZONE)}
            </span>
          </span>

          <span className="text-title min-w-0 truncate text-[13px] font-semibold sm:flex-1">
            {event.group?.label ?? event.group?.name ?? event.title}
          </span>

          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0 sm:flex-nowrap">
            {/* Nobody on the lecture means a register nobody can take, since
                only the teacher it is timetabled to may mark it — the same
                failure the catalogue flags on an unstaffed course, so it is
                flagged as loudly. */}
            <span className="flex min-w-0 items-center sm:w-[168px]">
              {event.faculty ? (
                <span className="text-muted truncate text-[12.5px]">
                  {event.faculty.user.name ?? "Unnamed"}
                </span>
              ) : (
                <Badge tone="red" dot>
                  No teacher
                </Badge>
              )}
            </span>
            <Badge tone="slate">{event.room.code}</Badge>
            <span className="text-faint shrink-0 font-mono text-[11.5px] sm:w-[86px] sm:text-right">
              {event.rrule
                ? countLabel(event._count.occurrences, "sitting")
                : "one-off"}
            </span>
          </span>
        </div>
      ))}
    </Card>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl p-3 text-[13px] font-medium text-[#b02636]"
      style={{
        background: "rgba(220,56,72,0.07)",
        boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
      }}
    >
      {message}
    </div>
  );
}
