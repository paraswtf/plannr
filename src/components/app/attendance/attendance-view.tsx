"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Avatar } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { formatFullDate, formatHourLabel } from "~/lib/dates";
import { api, type RouterOutputs } from "~/trpc/react";
import { markMeta, MARK_STATUSES as STATUSES } from "./status";

/**
 * The register for one sitting.
 *
 * Everyone starts present and you mark the exceptions, because that is how a
 * register is actually taken — reading out a list and noting the silences. A
 * lecture given to two groups shows a tab each: same room, same hour, two
 * registers.
 */

type Sitting = NonNullable<RouterOutputs["attendance"]["forOccurrence"]>;
type Status = Sitting["groups"][number]["students"][number]["status"];

export function AttendanceView({
  occurrenceId,
  initial,
  canMark,
}: {
  occurrenceId: string;
  initial: Sitting;
  canMark: boolean;
}) {
  const router = useRouter();
  const utils = api.useUtils();

  const { data } = api.attendance.forOccurrence.useQuery(
    { occurrenceId },
    { initialData: initial },
  );
  const sitting = data ?? initial;

  const [groupId, setGroupId] = useState(sitting.groups[0]?.id ?? "");
  const group =
    sitting.groups.find((g) => g.id === groupId) ?? sitting.groups[0];

  // The marks being edited, keyed by student. Seeded from whatever was saved
  // before, so re-opening a marked register shows what was marked.
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!group) return;
    setMarks(Object.fromEntries(group.students.map((s) => [s.id, s.status])));
  }, [group?.id, group]);

  const mark = api.attendance.mark.useMutation({
    onSuccess: async (result) => {
      // Said as a time first, and the server's count second and in its own
      // words: the server counts late as present, so "17 of 22 present" beside
      // a tally reading "16 present, 2 late" looked like two answers to one
      // question.
      setSaved(
        `Saved at ${formatHourLabel(new Date(), "Asia/Kolkata")}, ${result.present} of ${result.marked} counted present`,
      );
      await utils.attendance.invalidate();
      router.refresh();
    },
  });

  if (!group) {
    return (
      <>
        <PageHeader title="Attendance" subtitle={sitting.title} />
        <PageBody width="narrow">
          <EmptyState icon="users" title="No register to take">
            This lecture has no group attending it, so there is no register to
            take. Add a group to the class first.
          </EmptyState>
        </PageBody>
      </>
    );
  }

  const counts = STATUSES.map((status) => ({
    ...status,
    count: group.students.filter((s) => marks[s.id] === status.value).length,
  }));
  const present = counts.find((c) => c.value === "PRESENT")?.count ?? 0;

  const setAll = (status: Status) =>
    setMarks(Object.fromEntries(group.students.map((s) => [s.id, status])));

  // A reader looking at a register nobody has taken. The marks are seeded as
  // present for the person taking it, so counting them here would announce a
  // full house for a lecture with no register at all.
  const untakenForReader = !canMark && !group.markedAt;

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={`${sitting.title} · ${formatFullDate(sitting.start, "Asia/Kolkata")}, ${formatHourLabel(sitting.start, "Asia/Kolkata")}-${formatHourLabel(sitting.end, "Asia/Kolkata")}`}
        back={{ href: "/timetable", label: "Back to timetable" }}
      />

      {/*
        A column rather than the full width: on a laptop the marks sat 800px
        from the names they belonged to, and a register is read along the row.
      */}
      <PageBody width="narrow">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone="slate">{sitting.room.code}</Badge>
          {sitting.facultyName && (
            <span className="text-muted text-sm">{sitting.facultyName}</span>
          )}
          {sitting.groups.length > 1 && (
            // A line of its own on a phone: three divisions' names beside the
            // room and the teacher's name would leave the tabs a few pixels
            // each. How the strip behaves when it is still too wide is the
            // pill group's own business — it scrolls inside itself.
            <div className="w-full min-w-0 sm:ml-auto sm:w-auto">
              <Segmented
                items={sitting.groups.map((g) => ({
                  value: g.id,
                  label: g.name,
                }))}
                value={group.id}
                onChange={setGroupId}
                size="sm"
              />
            </div>
          )}
        </div>

        <Card pad={0}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 shadow-[inset_0_-1px_0_var(--hair-soft)]">
            {/*
              Whether this register has been taken lives with the group it is
              about, under its name, rather than as a mono label orphaned at
              the end of the strip above (on a phone it fell to a line of its
              own under the tabs).
            */}
            <div className="min-w-0">
              <p className="font-display text-title text-md font-semibold tracking-[-0.01em]">
                {group.label}
              </p>
              <p className="text-muted text-xs">
                {untakenForReader ? (
                  "No register has been taken for this lecture yet"
                ) : (
                  <>
                    <span className="tabular-nums">
                      {present} of {group.students.length} present
                    </span>
                    {" · "}
                    {group.markedAt
                      ? `Last taken by ${group.markedBy ?? "someone"}`
                      : "Not taken yet"}
                  </>
                )}
              </p>
            </div>
            {canMark && (
              // Their own line on a phone, sharing it half and half: these are
              // the two strokes that start a register, and reaching them should
              // not mean aiming at a chip wedged beside the group's name.
              <span className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                <Button
                  size="sm"
                  onClick={() => setAll("PRESENT")}
                  className="flex-1 sm:flex-none"
                >
                  All present
                </Button>
                <Button
                  size="sm"
                  onClick={() => setAll("ABSENT")}
                  className="flex-1 sm:flex-none"
                >
                  All absent
                </Button>
              </span>
            )}
          </div>

          {group.students.length === 0 ? (
            <EmptyState
              compact
              icon="users"
              title="Nobody is in this group yet"
            />
          ) : (
            group.students.map((student, i) => (
              <div
                key={student.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 ${
                  i > 0 ? "shadow-[inset_0_1px_0_var(--hair-soft)]" : ""
                }`}
              >
                <Avatar name={student.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="text-title block truncate text-base font-semibold">
                    {student.name}
                  </span>
                  <span className="text-faint block truncate font-mono text-xs">
                    {student.prn}
                  </span>
                </span>

                {canMark ? (
                  /*
                    A register is taken standing up, one thumb, sixty names. On
                    a phone the four marks drop below the name and share the
                    width evenly, which buys each of them a target a finger can
                    actually hit; squeezed onto the name's line they came out
                    around 24px tall and 40px wide. The row they sat in returns
                    at `sm`, and the marks settle to 32px tall at `lg`, where
                    there is a mouse.
                  */
                  <span className="flex w-full items-center gap-1.5 sm:w-auto sm:gap-1">
                    {STATUSES.map((status) => {
                      const on = marks[student.id] === status.value;
                      return (
                        <button
                          key={status.value}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setMarks((current) => ({
                              ...current,
                              [student.id]: status.value,
                            }))
                          }
                          className={`plr-clip min-h-10 flex-1 cursor-pointer rounded-[8px] px-2.5 text-xs font-semibold active:scale-[0.97] sm:flex-none lg:min-h-8 ${
                            on
                              ? status.pressed
                              : "text-muted hover:bg-tint-hover hover:text-title shadow-[inset_0_0_0_1px_var(--hair)]"
                          }`}
                        >
                          {status.label}
                        </button>
                      );
                    })}
                  </span>
                ) : student.marked ? (
                  // Read back, present is the ordinary case and stays quiet;
                  // only the exceptions are badged, so the three absences in a
                  // list of twenty are what the eye lands on.
                  student.status === "PRESENT" ? (
                    // Padded like a badge, so its word lines up with theirs.
                    <span className="text-muted px-2 text-xs font-semibold">
                      Present
                    </span>
                  ) : (
                    <Badge tone={markMeta(student.status)?.badge ?? "neutral"}>
                      {markMeta(student.status)?.label ?? "No mark"}
                    </Badge>
                  )
                ) : untakenForReader ? null : (
                  // The marking side seeds everyone as present, because that is
                  // how a register is taken. Reflecting that back at somebody
                  // who cannot mark would show an untaken register as a full
                  // house, so a reader is told there is nothing here instead —
                  // once, in the header, when nobody's register was taken, and
                  // on the row for somebody missing from one that was.
                  <span className="text-faint text-xs font-semibold">
                    No register taken
                  </span>
                )}
              </div>
            ))
          )}
        </Card>

        {canMark && group.students.length > 0 && (
          /*
            The tally and the save ride along the bottom of the screen while
            the list scrolls under them. A register is marked at the top of a
            sixty-name list and committed once; at the end of the list the save
            was 2800px down a phone and below the fold of any class larger than
            a dozen. Sticky within the column, so at the end of the list it
            settles under the card instead of covering the last row, and lifted
            off the bottom edge by the phone's home indicator where there is one.
          */
          <div className="bg-surface sticky bottom-[calc(12px+env(safe-area-inset-bottom))] z-10 mt-3 flex items-center gap-3 rounded-[var(--radius-card)] py-2.5 pr-2.5 pl-4 shadow-[var(--ring),var(--shadow-md)]">
            <div className="min-w-0 flex-1">
              <p className="text-ink text-sm font-medium tabular-nums">
                {counts
                  .filter((c) => c.count > 0)
                  .map((c) => `${c.count} ${c.label.toLowerCase()}`)
                  .join(", ")}
              </p>
              <div role="status" aria-live="polite">
                {saved && !mark.error && (
                  <p className="text-good flex items-center gap-1.5 text-xs font-semibold">
                    <Icon name="checkCircle" size={13} stroke={2} />
                    {saved}
                  </p>
                )}
              </div>
              {mark.error && (
                <p
                  role="alert"
                  className="text-bad flex items-center gap-1.5 text-xs font-semibold"
                >
                  <Icon name="alert" size={13} stroke={2} />
                  {mark.error.message}
                </p>
              )}
            </div>
            <Button
              variant="primary"
              disabled={mark.isPending}
              onClick={() =>
                mark.mutate({
                  occurrenceId,
                  groupId: group.id,
                  records: group.students.map((s) => ({
                    studentId: s.id,
                    status: marks[s.id] ?? "PRESENT",
                  })),
                })
              }
            >
              {mark.isPending
                ? "Saving…"
                : group.markedAt
                  ? "Update register"
                  : "Save register"}
            </Button>
          </div>
        )}
      </PageBody>
    </>
  );
}
