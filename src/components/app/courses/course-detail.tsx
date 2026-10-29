"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { KIND_LABEL, KIND_TONE } from "~/components/app/groups/group-vocab";
import { CourseSwatch } from "~/components/ui/course-swatch";
import { facultyCard, groupCard } from "~/components/app/people/entity-cards";
import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Avatar } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import {
  EntityPicker,
  pickerPage,
  useDebounced,
} from "~/components/ui/entity-picker";
import { Icon, type IconName } from "~/components/ui/icon";
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
        back={{ href: "/courses", label: "All courses" }}
      />

      <PageBody>
        {/* One strip of three figures rather than three tiles: the tiles were
            the dashboard everyone has seen, and on a phone they stacked into
            430px of boxes before the first list. Three columns at every width;
            the notes under the figures are a desktop luxury, since each says
            again something the lists below show. */}
        <Card pad={0} className="mb-5 grid grid-cols-3">
          <Figure
            label="Students"
            icon="users"
            value={course.headcount}
            note={`across ${countLabel(course.groups.length, "group")}`}
          />
          <Figure
            label="Cleared to teach"
            icon="users"
            value={course.faculty.length}
            note={
              course.faculty.length === 0
                ? "cannot be timetabled yet"
                : "any of them may take a lecture"
            }
            bad={course.faculty.length === 0}
          />
          <Figure
            label="Lectures"
            icon="calendar"
            value={course.events.length}
            note={`${countLabel(sittings, "sitting")} scheduled`}
          />
        </Card>

        {/* Top-aligned, so each card is the height of what it holds rather
            than both stretched to the taller one. */}
        <div className="mb-4 grid grid-cols-1 items-start gap-4 md:grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
          <Card title="Who may teach it">
            {/* Nobody cleared to teach is the one fact on this page that
                stops anything happening, so it is said first and in red,
                in both views, rather than in faint type under the picker. */}
            {course.faculty.length === 0 && (
              <Callout tone="bad" className={canManage ? "mb-3" : ""}>
                {NO_FACULTY_NOTE}
              </Callout>
            )}
            {canManage ? (
              <FacultyEditor course={course} />
            ) : course.faculty.length === 0 ? null : (
              <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                {course.faculty.map((teacher) => (
                  <span
                    key={teacher.id}
                    className="text-ink inline-flex items-center gap-2 text-sm"
                  >
                    <Avatar name={teacher.name} size={24} />
                    {teacher.name}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Which groups take it"
            action={
              <span className="text-faint font-mono text-xs tabular-nums">
                {countLabel(course.headcount, "student")}
              </span>
            }
          >
            {canManage ? (
              <GroupsEditor course={course} />
            ) : course.groups.length === 0 ? (
              <p className="text-muted text-sm">
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
                    <span className="text-title w-full min-w-0 truncate text-sm font-semibold sm:w-auto sm:flex-1">
                      {group.name}
                    </span>
                    <Badge tone={KIND_TONE[group.kind]}>
                      {KIND_LABEL[group.kind]}
                    </Badge>
                    <span className="text-faint shrink-0 font-mono text-xs tabular-nums sm:w-[80px] sm:text-right">
                      {countLabel(group.students, "student")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Lectures events={course.events} />
      </PageBody>
    </>
  );
}

/**
 * One of the three figures in the strip under the header: the label, then the
 * number leading in the display face, then a note on wider screens. `bad` sets
 * the number in the bad ink, for the one figure that can be a problem.
 */
function Figure({
  label,
  icon,
  value,
  note,
  bad = false,
}: {
  label: string;
  icon: IconName;
  value: number;
  note: string;
  bad?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 py-3.5 shadow-[inset_1px_0_0_var(--hair-soft)] first:shadow-none sm:px-5 sm:py-4">
      <div className="text-muted flex items-center gap-1.5 text-xs font-medium">
        <Icon
          name={icon}
          size={14}
          stroke={2}
          className={`hidden shrink-0 sm:block ${bad ? "text-bad" : ""}`}
        />
        <span className="min-w-0">{label}</span>
      </div>
      <div
        className={`font-display mt-1.5 text-xl leading-none font-semibold tracking-[-0.02em] tabular-nums ${
          bad ? "text-bad" : "text-title"
        }`}
      >
        {value}
      </div>
      <div
        className={`mt-1.5 hidden text-xs sm:block ${bad ? "text-bad" : "text-faint"}`}
      >
        {note}
      </div>
    </div>
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

  const faculty = api.groups.facultyList.useQuery(
    {
      query: useDebounced(query) || undefined,
      pageSize,
      // Pins whoever is already on the list so a search cannot hide them.
      includeIds: course.faculty.map((f) => f.id),
    },
    // Keeps the list on screen while a longer page or a new search loads.
    { placeholderData: (prev) => prev },
  );

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
      {error && (
        <Callout tone="bad" role="alert">
          {error}
        </Callout>
      )}
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
      {/* When nobody is cleared, the card already opens on that in red, so
          the hint would only say it a second time. */}
      {course.faculty.length > 0 && (
        <span className="text-faint text-xs">
          Only the teacher a lecture is timetabled to can take its register.
        </span>
      )}
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

  const groups = api.groups.list.useQuery(
    {
      query: useDebounced(query) || undefined,
      pageSize,
      includeIds: course.groups.map((g) => g.id),
    },
    { placeholderData: (prev) => prev },
  );

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
      {error && (
        <Callout tone="bad" role="alert">
          {error}
        </Callout>
      )}
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
      <span className="text-faint text-xs">
        Adding a group enrols everyone in it; there is no separate enrolment
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
        <EmptyState
          compact
          icon="calendar"
          title="Nothing is timetabled for this course yet"
        />
      </Card>
    );
  }

  return (
    <Card pad={0}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 shadow-[inset_0_-1px_0_var(--hair-soft)]">
        <h2 className="font-display text-title text-md font-semibold tracking-[-0.01em]">
          Lectures
        </h2>
        <span className="text-muted text-sm">
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
          className={`flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 sm:py-2.5 ${i > 0 ? "shadow-[inset_0_1px_0_var(--hair-soft)]" : ""}`}
        >
          <span className="flex shrink-0 items-center gap-3">
            <span className="text-title font-mono text-xs font-semibold sm:w-[104px]">
              {whenLabel(event)}
            </span>
            <span className="text-muted font-mono text-xs sm:w-[116px]">
              {formatHourLabel(event.startTime, DEFAULT_TIMEZONE)}-
              {formatHourLabel(event.endTime, DEFAULT_TIMEZONE)}
            </span>
          </span>

          <span className="text-title min-w-0 truncate text-sm font-semibold sm:flex-1">
            {event.group?.label ?? event.group?.name ?? event.title}
          </span>

          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0 sm:flex-nowrap">
            {/* Nobody on the lecture means a register nobody can take, since
                only the teacher it is timetabled to may mark it — the same
                failure the catalogue flags on an unstaffed course, so it is
                flagged as loudly. */}
            <span className="flex min-w-0 items-center sm:w-[168px]">
              {event.faculty ? (
                <span className="text-muted truncate text-sm">
                  {event.faculty.user.name ?? "Unnamed"}
                </span>
              ) : (
                <Badge tone="red" icon="alert">
                  No teacher
                </Badge>
              )}
            </span>
            <Badge tone="slate">{event.room.code}</Badge>
            <span className="text-faint shrink-0 font-mono text-xs tabular-nums sm:w-[86px] sm:text-right">
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
