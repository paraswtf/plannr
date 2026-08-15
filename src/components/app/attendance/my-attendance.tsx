"use client";

import { useNow } from "~/components/app/timetable/use-now";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { DEFAULT_TIMEZONE, formatFullDate, formatHourLabel } from "~/lib/dates";
import { type RouterOutputs } from "~/trpc/react";
import { markMeta } from "./status";

/**
 * A student's own attendance.
 *
 * Written for the moment somebody opens it worried, so the shortfall is stated
 * before anything else. The verdict is what the screen is for; the register
 * behind each course answers the follow-up question — which lecture did I miss —
 * and is one click away rather than six courses' worth of scrolling.
 */

type Mine = RouterOutputs["attendance"]["mine"];
type Course = Mine["courses"][number];

export function MyAttendance({ mine }: { mine: Mine }) {
  const now = useNow(60_000);
  const { threshold, courses } = mine;
  const short = courses.filter(
    (course) => course.percentage !== null && course.percentage < threshold,
  );
  // Worst first rather than alphabetical: on a screen opened out of worry, the
  // course in trouble should not be the fourth one you scroll past. A course
  // with no register yet has no standing to sort on and goes last.
  const ordered = [...courses].sort(
    (a, b) => (a.percentage ?? 101) - (b.percentage ?? 101),
  );

  if (courses.length === 0) {
    return (
      <Card>
        <p className="text-muted m-0 text-[14px]">
          You are not in any group yet, so there is nothing to keep attendance
          for. Your courses are the courses of the groups you belong to — the
          office adds you to a group and they appear here.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card
        pad={18}
        className="mb-5"
        style={{
          boxShadow: `var(--ring), var(--shadow-card), inset 4px 0 0 ${short.length > 0 ? "var(--red)" : "var(--green)"}`,
        }}
      >
        <div className="flex items-start gap-3">
          <Icon
            name={short.length > 0 ? "alert" : "checkCircle"}
            size={20}
            color={short.length > 0 ? "var(--red)" : "var(--green)"}
            stroke={2}
          />
          <div className="min-w-0">
            <p className="font-display text-title m-0 text-[17px] font-bold">
              {headline(courses.length, short.length, threshold)}
            </p>
            {short.length > 0 && (
              <p className="text-muted mt-1 mb-0 text-[13px]">
                {short.map((course) => course.title).join(", ")}
              </p>
            )}
            <p className="text-faint mt-2 mb-0 text-[12.5px]">
              A percentage counts only the registers that were actually taken.
              Open a course to see every lecture, including the ones nobody
              marked — those count neither for you nor against you.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        {ordered.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            threshold={threshold}
            now={now}
          />
        ))}
      </div>
    </>
  );
}

/** The answer to "am I alright?", before any number is read. */
function headline(total: number, short: number, threshold: number): string {
  if (total === 1) {
    return short === 0
      ? `You are at or above ${threshold}% in your one course.`
      : `You are below ${threshold}% in your one course.`;
  }
  return short === 0
    ? `You are at or above ${threshold}% in all ${total} of your courses.`
    : `You are below ${threshold}% in ${short} of your ${total} courses.`;
}

function CourseCard({
  course,
  threshold,
  now,
}: {
  course: Course;
  threshold: number;
  now: Date;
}) {
  const ok = course.percentage !== null && course.percentage >= threshold;
  const colour = ok ? "var(--green)" : "var(--red)";
  const verdict = standing(course, threshold);
  const missed = course.register.filter((s) => s.status === "ABSENT").length;

  return (
    <Card pad={0}>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h3 className="font-display text-title m-0 text-[17px] font-bold">
              {course.title}
            </h3>
            <p className="text-faint mt-0.5 mb-0 font-mono text-[12px]">
              {course.code ?? "no paper code"}
            </p>
          </div>
          <div className="text-right">
            <div
              className="font-display text-[30px] leading-none font-bold tracking-[-0.02em]"
              style={{
                color: course.percentage === null ? "var(--faint)" : colour,
              }}
            >
              {course.percentage === null ? "—" : `${course.percentage}%`}
            </div>
            <div className="text-muted mt-1.5 text-[12.5px]">
              {course.attended} attended of {course.conducted} taken
            </div>
          </div>
        </div>

        <Meter percentage={course.percentage} threshold={threshold} />

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {course.percentage !== null && (
            <Badge tone={ok ? "green" : "red"} dot>
              {ok ? `At or above ${threshold}%` : `Below ${threshold}%`}
            </Badge>
          )}
          <span className="text-muted text-[12.5px]">
            {course.conducted === 0
              ? "No register taken yet"
              : `${course.conducted} ${course.conducted === 1 ? "register" : "registers"} taken`}{" "}
            · {course.scheduled} scheduled this semester
          </span>
        </div>

        {verdict && (
          <p
            className="mt-3 mb-0 rounded-[10px] px-3.5 py-2.5 text-[13px] font-semibold"
            style={
              verdict.tone === "red"
                ? { background: "rgba(220,56,72,0.10)", color: "#b02636" }
                : { background: "rgba(68,88,121,0.08)", color: "#324464" }
            }
          >
            {verdict.text}
          </p>
        )}
      </div>

      {/* Nothing timetabled yet: a disclosure onto an empty list is furniture. */}
      {course.register.length > 0 && (
        <details className="group">
          {/*
          A native disclosure rather than React state: it is keyboard- and
          screen-reader-operable without any ARIA of ours, and it survives a
          page that has not hydrated yet.
        */}
          <summary
            className="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 [&::-webkit-details-marker]:hidden"
            style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
          >
            <Icon
              name="chevronDown"
              size={14}
              className="text-faint shrink-0 transition-transform duration-150 group-open:rotate-180"
            />
            <span className="text-muted text-[12.5px] font-semibold">
              {course.register.length}{" "}
              {course.register.length === 1 ? "lecture" : "lectures"}
            </span>
            {/*
            The closed state has to say whether opening it is worth the click,
            and an absence is the only thing anybody opens this for.
          */}
            {missed > 0 && (
              <span
                className="text-[12.5px] font-semibold"
                style={{ color: "var(--red)" }}
              >
                · {missed} missed
              </span>
            )}
            <span className="text-faint ml-auto font-mono text-[11.5px]">
              most recent first
            </span>
          </summary>

          {course.register.map((sitting) => {
            const meta = markMeta(sitting.status);
            return (
              <div
                key={sitting.occurrenceId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5"
                style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
              >
                <span className="text-title w-[130px] shrink-0 text-[13px] font-semibold">
                  {formatFullDate(sitting.start, DEFAULT_TIMEZONE)}
                </span>
                <span className="text-muted w-[112px] shrink-0 font-mono text-[12px]">
                  {formatHourLabel(sitting.start, DEFAULT_TIMEZONE)}–
                  {formatHourLabel(sitting.end, DEFAULT_TIMEZONE)}
                </span>
                <span className="text-muted min-w-0 flex-1 truncate text-[12.5px]">
                  {[sitting.room, sitting.faculty]
                    .filter(Boolean)
                    .join(" · ") || "room and teacher not recorded"}
                </span>
                {meta ? (
                  <Badge tone={meta.badge}>{meta.label}</Badge>
                ) : (
                  <span className="text-faint text-[12px] font-semibold">
                    {sitting.start > now
                      ? "Yet to happen"
                      : "No register taken"}
                  </span>
                )}
              </div>
            );
          })}
        </details>
      )}
    </Card>
  );
}

/** The percentage as a bar with the pass mark drawn on it — the one-glance answer. */
function Meter({
  percentage,
  threshold,
}: {
  percentage: number | null;
  threshold: number;
}) {
  const ok = percentage !== null && percentage >= threshold;
  return (
    <div
      role="img"
      aria-label={
        percentage === null
          ? `No registers taken yet; the pass mark is ${threshold}%`
          : `${percentage}% attended against a ${threshold}% pass mark`
      }
      className="relative mt-4 h-2 w-full rounded-full"
      style={{ background: "rgba(68,88,121,0.12)" }}
    >
      <div
        className="h-2 rounded-full"
        style={{
          width: `${Math.min(100, percentage ?? 0)}%`,
          background: ok ? "var(--green)" : "var(--red)",
        }}
      />
      <span
        className="absolute -top-1 h-4 w-[2px] rounded-full"
        style={{ left: `${threshold}%`, background: "var(--slate)" }}
      />
    </div>
  );
}

/**
 * What to do about it, in one sentence.
 *
 * `needed` is null in two opposite situations — already safe, and no longer
 * reachable — so the percentage has to be read first to tell them apart. Saying
 * "attend N more" to somebody who cannot get there would be a lie of arithmetic.
 *
 * `remaining` is the server's count of sittings still without a register, never
 * `scheduled - conducted` worked out here: that would count the excused ones as
 * still winnable, and this sentence is where the arithmetic gets quoted back at
 * a student as a promise.
 */
function standing(
  course: Course,
  threshold: number,
): { text: string; tone: "red" | "neutral" } | null {
  if (course.percentage === null) {
    // Nobody has marked anything. Said plainly and in a neutral colour, because
    // it is the college's omission and not the student's problem.
    return course.remaining === 0
      ? {
          text: "No register was ever taken for this course, so there is no percentage to report.",
          tone: "neutral",
        }
      : null;
  }
  if (course.percentage >= threshold) return null;
  if (course.needed !== null) {
    // "Marked present" rather than "attend the next N": some of what is left is
    // a sitting that already happened and never had its register taken, and
    // nobody can attend those.
    return {
      text:
        course.needed === 1
          ? `One more lecture marked present would reach ${threshold}%.`
          : `${course.needed} more lectures marked present would reach ${threshold}%.`,
      tone: "red",
    };
  }
  return {
    text:
      course.remaining === 0
        ? `No lectures are left to mark, so ${course.percentage}% is the final figure. Talk to the office.`
        : `Even a clean record from here leaves you under ${threshold}%. Talk to the office.`,
    tone: "red",
  };
}
