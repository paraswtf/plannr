"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { KIND_LABEL, KIND_TONE } from "~/components/app/groups/group-vocab";
import { facultyCard, groupCard } from "~/components/app/people/entity-cards";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import {
  EntityPicker,
  initialsOf,
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
        subtitle={[course.code, course.programme?.name, course.semester.name]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Link
            href="/courses"
            className="text-muted inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold"
            style={{ boxShadow: "var(--ring)" }}
          >
            All courses
          </Link>
        }
      />

      <div className="px-9 pt-2 pb-10">
        <div className="mb-5 grid [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))] gap-4">
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

        <div className="mb-4 grid [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))] gap-4">
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
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
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
                    className="flex items-center gap-2.5 py-1.5"
                  >
                    <span className="text-title min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {group.name}
                    </span>
                    <Badge tone={KIND_TONE[group.kind]}>
                      {KIND_LABEL[group.kind]}
                    </Badge>
                    <span className="text-faint w-[80px] shrink-0 text-right font-mono text-[12px]">
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
        page={
          faculty.data && {
            ...faculty.data,
            rows: faculty.data.rows.map(facultyCard),
          }
        }
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
        page={
          groups.data && {
            ...groups.data,
            rows: groups.data.rows.map(groupCard),
          }
        }
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
          className="flex flex-wrap items-center gap-3 px-4 py-2.5"
          style={
            i > 0 ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" } : undefined
          }
        >
          <span className="text-title w-[104px] shrink-0 font-mono text-[12px] font-bold">
            {whenLabel(event)}
          </span>
          <span className="text-muted w-[116px] shrink-0 font-mono text-[12px]">
            {formatHourLabel(event.startTime, DEFAULT_TIMEZONE)}–
            {formatHourLabel(event.endTime, DEFAULT_TIMEZONE)}
          </span>
          <span className="text-title min-w-0 flex-1 truncate text-[13px] font-semibold">
            {event.group?.label ?? event.group?.name ?? event.title}
          </span>
          {/* Nobody on the lecture means a register nobody can take, since only
              the teacher it is timetabled to may mark it — the same failure the
              catalogue flags on an unstaffed course, so it is flagged as
              loudly. */}
          <span className="flex w-[168px] shrink-0 items-center">
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
          <span className="text-faint w-[86px] shrink-0 text-right font-mono text-[11.5px]">
            {event.rrule
              ? countLabel(event._count.occurrences, "sitting")
              : "one-off"}
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
