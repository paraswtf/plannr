"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { api, type RouterOutputs } from "~/trpc/react";
import { countLabel } from "./course-vocab";

type Catalogue = RouterOutputs["courses"]["list"];
type Course = Catalogue["courses"][number];
type Programme = NonNullable<Course["programme"]>;

/**
 * Section and filter key for a course with no programme, which the model
 * allows. A real programme id is a cuid, so this cannot collide with one.
 */
const UNFILED = "unfiled";

/**
 * Every subject taught this semester, filed under the programme that runs it.
 *
 * The whole semester comes down in one read — a couple of hundred rows — so the
 * search and the programme filter run here rather than a round trip per
 * keystroke. Filtering locally also matches a paper code and a programme code,
 * neither of which the server's title-only search reaches.
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

  const unstaffed = catalogue.courses.filter(
    (course) => course._count.faculty === 0,
  ).length;

  // The programmes that actually run something this semester, taken from the
  // rows themselves so the filter can never offer an empty choice.
  const programmes = useMemo(() => {
    const counts = new Map<string, Programme & { courses: number }>();
    let unfiled = 0;
    for (const course of catalogue.courses) {
      if (!course.programme) {
        unfiled += 1;
        continue;
      }
      const seen = counts.get(course.programme.id);
      if (seen) seen.courses += 1;
      else counts.set(course.programme.id, { ...course.programme, courses: 1 });
    }
    return { rows: [...counts.values()], unfiled };
  }, [catalogue.courses]);

  const needle = query.trim().toLowerCase();
  const sections = useMemo(() => {
    const matched = catalogue.courses.filter((course) => {
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
  }, [catalogue.courses, needle, programmeId, staffing]);

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

      <div className="px-9 pt-2 pb-10">
        {!catalogue.semester ? (
          <Card>
            <p className="text-muted m-0 text-[14px]">
              No semester has been set up yet, so there is nothing being taught.
              Create one before adding courses.
            </p>
          </Card>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative w-72">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
                  <Icon name="search" size={15} color="var(--faint)" />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by title, code or programme…"
                  className="bg-surface w-full rounded-[10px] py-2 pr-3 pl-9 text-[13.5px] outline-none"
                  style={{ boxShadow: "var(--ring)" }}
                />
              </div>

              <div className="w-56">
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
                />
              )}

              <span className="text-faint ml-auto font-mono text-[12px]">
                {shown === catalogue.courses.length
                  ? countLabel(shown, "course")
                  : `${shown} of ${catalogue.courses.length}`}
              </span>
            </div>

            {sections.length === 0 ? (
              <Card>
                <p className="text-muted m-0 text-[14px]">
                  {needle
                    ? "No courses match that search."
                    : "No courses match those filters."}
                </p>
              </Card>
            ) : (
              sections.map(([key, section]) => (
                <section key={key} className="mb-6 last:mb-0">
                  <div className="mb-2 flex flex-wrap items-baseline gap-2.5 px-1">
                    <h2 className="font-display text-title text-[15px] font-bold">
                      {section.programme?.code ?? "No programme"}
                    </h2>
                    <span className="text-muted text-[12.5px]">
                      {section.programme?.name ??
                        "Taught this semester but not filed under one"}
                    </span>
                    <span className="text-faint ml-auto font-mono text-[12px]">
                      {countLabel(section.courses.length, "course")}
                    </span>
                  </div>

                  <Card pad={0}>
                    {section.courses.map((course, i) => (
                      <Link
                        key={course.id}
                        href={`/courses/${course.id}`}
                        // The counts wrap under the title once the row runs out
                        // of width, rather than pushing the page sideways: the
                        // title is the only column that can shrink, and it hits
                        // zero long before the fixed ones give way.
                        className="plr-clip plr-slotcol flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                        style={
                          i > 0
                            ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" }
                            : undefined
                        }
                      >
                        <span className="text-faint w-[72px] shrink-0 truncate font-mono text-[12px]">
                          {course.code ?? "—"}
                        </span>
                        <span className="text-title min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                          {course.title}
                        </span>
                        <span className="text-muted w-[76px] shrink-0 text-right font-mono text-[12px]">
                          {countLabel(course._count.groups, "group")}
                        </span>
                        <span className="w-[104px] shrink-0 text-right">
                          {course._count.faculty === 0 ? (
                            <Badge tone="red" dot>
                              No teacher
                            </Badge>
                          ) : (
                            <span className="text-muted font-mono text-[12px]">
                              {countLabel(course._count.faculty, "teacher")}
                            </span>
                          )}
                        </span>
                        <span className="text-muted w-[88px] shrink-0 text-right font-mono text-[12px]">
                          {countLabel(course._count.events, "lecture")}
                        </span>
                        <Icon
                          name="chevronRight"
                          size={14}
                          color="var(--faint)"
                        />
                      </Link>
                    ))}
                  </Card>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}
