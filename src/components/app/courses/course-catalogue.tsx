"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { CourseSwatch } from "~/components/ui/course-swatch";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Input } from "~/components/ui/field";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { api, type RouterOutputs } from "~/trpc/react";
import { countLabel } from "./course-vocab";

type Catalogue = RouterOutputs["courses"]["list"];
type Course = Catalogue["rows"][number];
type Programme = NonNullable<Course["programme"]>;

/**
 * Section and filter key for a course with no programme, which the model
 * allows. A real programme id is a cuid, so this cannot collide with one.
 */
const UNFILED = "unfiled";

/**
 * Every subject taught this semester, filed under the programme that runs it.
 *
 * The whole semester comes down in one read — a couple of hundred rows, well
 * inside the page `courses.list` hands back when nobody asks for a particular
 * one — so the search and the programme filter run here rather than a round
 * trip per keystroke. Filtering locally also matches a paper code and a
 * programme code, neither of which the server's title-only search reaches.
 */
export function CourseCatalogue({
  initial,
  canManage,
}: {
  initial: Catalogue;
  canManage: boolean;
}) {
  const { data } = api.courses.list.useQuery({}, { initialData: initial });
  const catalogue = data ?? initial;

  const [query, setQuery] = useState("");
  const [programmeId, setProgrammeId] = useState("");
  const [staffing, setStaffing] = useState<"all" | "unstaffed">("all");

  const unstaffed = catalogue.rows.filter(
    (course) => course._count.faculty === 0,
  ).length;

  // The programmes that actually run something this semester, taken from the
  // rows themselves so the filter can never offer an empty choice.
  const programmes = useMemo(() => {
    const counts = new Map<string, Programme & { courses: number }>();
    let unfiled = 0;
    for (const course of catalogue.rows) {
      if (!course.programme) {
        unfiled += 1;
        continue;
      }
      const seen = counts.get(course.programme.id);
      if (seen) seen.courses += 1;
      else counts.set(course.programme.id, { ...course.programme, courses: 1 });
    }
    return { rows: [...counts.values()], unfiled };
  }, [catalogue.rows]);

  const needle = query.trim().toLowerCase();
  const sections = useMemo(() => {
    const matched = catalogue.rows.filter((course) => {
      const key = course.programme?.id ?? UNFILED;
      if (programmeId && key !== programmeId) return false;
      if (staffing === "unstaffed" && course._count.faculty > 0) return false;
      if (!needle) return true;
      return (
        course.title.toLowerCase().includes(needle) ||
        (course.code?.toLowerCase().includes(needle) ?? false) ||
        (course.programme?.code.toLowerCase().includes(needle) ?? false)
      );
    });

    // A Map keeps the server's order — programme, then title — while tolerating
    // the unfiled courses, which arrive last and belong in one section.
    const grouped = new Map<
      string,
      { programme: Programme | null; courses: Course[] }
    >();
    for (const course of matched) {
      const key = course.programme?.id ?? UNFILED;
      const open = grouped.get(key);
      if (open) open.courses.push(course);
      else grouped.set(key, { programme: course.programme, courses: [course] });
    }
    return [...grouped.entries()];
  }, [catalogue.rows, needle, programmeId, staffing]);

  const shown = sections.reduce((n, [, s]) => n + s.courses.length, 0);

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle={
          catalogue.semester
            ? `The subjects taught in ${catalogue.semester.name}. Students take the ones their groups take.`
            : "The subjects taught this semester."
        }
      />

      <PageBody>
        {!catalogue.semester ? (
          <Card>
            <EmptyState icon="book" title="No semester yet">
              No semester has been set up yet, so there is nothing being taught.
              Create one before adding courses.
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              {/* The search takes the whole width on a phone and the filters
                  share the line under it: a 288px box beside a 224px one needs
                  more room than the screen has. */}
              <Input
                icon="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, code or programme…"
                // The placeholder goes the moment something is typed, so the
                // field's name is said separately.
                aria-label="Search courses"
                className="w-full sm:w-72"
              />

              {/* The floor is what "All programmes" needs before its own
                  truncation starts eating it, so sharing the line with the
                  staffing filter narrows the control without blanking it. */}
              <div className="min-w-[136px] flex-1 sm:w-56 sm:flex-none">
                <Select
                  ariaLabel="Programme"
                  value={programmeId}
                  options={[
                    { value: "", label: "All programmes" },
                    ...programmes.rows.map((programme) => ({
                      value: programme.id,
                      label: programme.code,
                      hint: `${programme.name} · ${countLabel(programme.courses, "course")}`,
                    })),
                    ...(programmes.unfiled > 0
                      ? [
                          {
                            value: UNFILED,
                            label: "No programme",
                            hint: countLabel(programmes.unfiled, "course"),
                          },
                        ]
                      : []),
                  ]}
                  onChange={setProgrammeId}
                />
              </div>

              {/* Only a coordinator can do anything about an unstaffed course,
                  so nobody else is offered the filter. The flag on the row
                  itself stays visible to everyone. It also stays while the
                  filter is on: staffing the last unstaffed course would
                  otherwise take away the only control that clears it, leaving
                  an empty list and no way out of it. */}
              {canManage && (unstaffed > 0 || staffing === "unstaffed") && (
                <Segmented
                  items={[
                    { value: "all" as const, label: "All" },
                    {
                      value: "unstaffed" as const,
                      label: `No teacher (${unstaffed})`,
                    },
                  ]}
                  value={staffing}
                  onChange={setStaffing}
                  size="sm"
                  ariaLabel="Staffing"
                />
              )}

              {/* The tally would otherwise squeeze onto the filters' line and
                  crush both of them, so on a phone it takes a line of its own
                  and keeps the right edge it has beside them. */}
              <span className="text-faint w-full text-right font-mono text-xs tabular-nums sm:ml-auto sm:w-auto">
                {shown === catalogue.rows.length
                  ? countLabel(shown, "course")
                  : `${shown} of ${catalogue.rows.length}`}
              </span>
            </div>

            {sections.length === 0 ? (
              <Card>
                <EmptyState
                  compact
                  icon="search"
                  title={
                    needle
                      ? "No courses match that search"
                      : "No courses match those filters"
                  }
                />
              </Card>
            ) : (
              sections.map(([key, section]) => (
                <section key={key} className="mb-6 last:mb-0">
                  <div className="mb-2 flex flex-wrap items-baseline gap-2.5 px-1">
                    <h2 className="font-display text-title text-md font-semibold tracking-[-0.01em]">
                      {section.programme?.code ?? "No programme"}
                    </h2>
                    <span className="text-muted text-sm">
                      {section.programme?.name ??
                        "Taught this semester but not filed under one"}
                    </span>
                    <span className="text-faint ml-auto font-mono text-xs tabular-nums">
                      {countLabel(section.courses.length, "course")}
                    </span>
                  </div>

                  <Card pad={0} className="overflow-hidden">
                    {/* Column heads over the fixed columns, so the cells can
                        carry bare numbers: "3 groups / 1 teacher / 2 lectures"
                        on every row was a grey band of repeated nouns that
                        hid the one cell that matters, "No teacher". The
                        widths and gaps are the row's own, so a head sits
                        exactly over its column; a phone has no columns, and
                        keeps the nouns. */}
                    <div
                      aria-hidden
                      className="text-muted text-2xs hidden items-center gap-x-3 px-4 py-2 font-semibold shadow-[inset_0_-1px_0_var(--hair-soft)] sm:flex"
                    >
                      <span className="flex-1">Course</span>
                      <span className="w-[76px] text-right">Groups</span>
                      <span className="w-[104px] text-right">Teachers</span>
                      <span className="w-[88px] text-right">Lectures</span>
                      <span className="w-[14px]" />
                    </div>
                    {section.courses.map((course, i) => (
                      <Link
                        key={course.id}
                        href={`/courses/${course.id}`}
                        // Five columns need about 420px of fixed width before
                        // the title gets any, so on a phone the row becomes two
                        // lines — what the course is, then what it adds up to —
                        // rather than pushing the page sideways. From sm the
                        // two groups flatten back into the one row of columns,
                        // their inner gap matching the outer one so the
                        // grouping is invisible.
                        //
                        // The focus outline is drawn inside the row, since the
                        // card clips at its rounded corners.
                        className={`plr-clip plr-slotcol flex flex-col gap-1.5 px-4 py-3 focus-visible:-outline-offset-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1 sm:py-2.5 ${i > 0 ? "shadow-[inset_0_1px_0_var(--hair-soft)]" : ""}`}
                      >
                        <span className="flex min-w-0 items-center gap-3 sm:flex-1">
                          <CourseSwatch title={course.title} />
                          {/* A course with no paper code leaves the cell
                              empty rather than printing a dash for it. */}
                          <span className="text-faint w-[72px] shrink-0 truncate font-mono text-xs">
                            {course.code ?? ""}
                          </span>
                          <span className="text-title min-w-0 flex-1 truncate text-base font-semibold">
                            {course.title}
                          </span>
                          {/* The affordance belongs at the end of the line the
                              title is on, which is a different line in each
                              layout — and the arrow is decoration the screen
                              reader is already told to skip, so drawing it
                              twice is cheaper than moving it. */}
                          <Icon
                            name="chevronRight"
                            size={14}
                            color="var(--faint)"
                            className="sm:hidden"
                          />
                        </span>

                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0 sm:flex-nowrap">
                          <Count
                            n={course._count.groups}
                            noun="group"
                            className="sm:w-[76px]"
                          />
                          <span className="flex shrink-0 items-center sm:w-[104px] sm:justify-end">
                            {/* The glyph carries the warning as well as the
                                red, so it does not rest on colour alone. */}
                            {course._count.faculty === 0 ? (
                              <Badge tone="red" icon="alert">
                                No teacher
                              </Badge>
                            ) : (
                              <Count n={course._count.faculty} noun="teacher" />
                            )}
                          </span>
                          <Count
                            n={course._count.events}
                            noun="lecture"
                            className="sm:w-[88px]"
                          />
                        </span>

                        <Icon
                          name="chevronRight"
                          size={14}
                          color="var(--faint)"
                          className="hidden sm:block"
                        />
                      </Link>
                    ))}
                  </Card>
                </section>
              ))
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * A count in one of the row's columns: "3 groups" on a phone, where it is a
 * phrase in a line of them, and a bare "3" under its column head from sm.
 */
function Count({
  n,
  noun,
  className = "",
}: {
  n: number;
  noun: string;
  className?: string;
}) {
  return (
    <span
      className={`text-muted shrink-0 font-mono text-xs tabular-nums sm:text-right ${className}`}
    >
      <span className="sm:hidden">{countLabel(n, noun)}</span>
      {/* The head above names the column visually; the noun stays for a
          screen reader, which reads the row as one link and never sees it. */}
      <span className="hidden sm:inline">
        {n}
        <span className="sr-only"> {n === 1 ? noun : `${noun}s`}</span>
      </span>
    </span>
  );
}
