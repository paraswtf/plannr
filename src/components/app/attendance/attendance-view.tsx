"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
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
      setSaved(
        `${result.present} of ${result.marked} present · saved ${formatHourLabel(new Date(), "Asia/Kolkata")}`,
      );
      await utils.attendance.invalidate();
      router.refresh();
    },
  });

  if (!group) {
    return (
      <>
        <PageHeader title="Attendance" subtitle={sitting.title} />
        <div className="px-9 pt-2 pb-10">
          <Card>
            <p className="text-muted m-0 text-[14px]">
              This lecture has no group attending it, so there is no register to
              take. Add a group to the class first.
            </p>
          </Card>
        </div>
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

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={`${sitting.title} · ${formatFullDate(sitting.start, "Asia/Kolkata")} · ${formatHourLabel(sitting.start, "Asia/Kolkata")}–${formatHourLabel(sitting.end, "Asia/Kolkata")}`}
        actions={
          <Link
            href="/timetable"
            className="text-muted inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold"
            style={{ boxShadow: "var(--ring)" }}
          >
            Back to timetable
          </Link>
        }
      />

      <div className="px-9 pt-2 pb-10">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Badge tone="slate">{sitting.room.code}</Badge>
          {sitting.facultyName && (
            <span className="text-muted text-[13px]">
              {sitting.facultyName}
            </span>
          )}
          {sitting.groups.length > 1 && (
            <Segmented
              items={sitting.groups.map((g) => ({
                value: g.id,
                label: g.name,
              }))}
              value={group.id}
              onChange={setGroupId}
              size="sm"
            />
          )}
          <span className="text-faint ml-auto font-mono text-[12px]">
            {group.markedAt
              ? `last taken by ${group.markedBy ?? "someone"}`
              : "not taken yet"}
          </span>
        </div>

        <Card pad={0}>
          <div
            className="flex flex-wrap items-center gap-3 px-4 py-3"
            style={{ boxShadow: "inset 0 -1px 0 var(--hair-soft)" }}
          >
            <span className="font-display text-title text-[15px] font-bold">
              {group.label}
            </span>
            <span className="text-muted text-[12.5px]">
              {present} of {group.students.length} present
            </span>
            {canMark && (
              <span className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAll("PRESENT")}
                  className="text-slate cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
                  style={{ boxShadow: "var(--ring)" }}
                >
                  All present
                </button>
                <button
                  type="button"
                  onClick={() => setAll("ABSENT")}
                  className="text-muted cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
                  style={{ boxShadow: "var(--ring)" }}
                >
                  All absent
                </button>
              </span>
            )}
          </div>

          {group.students.length === 0 ? (
            <p className="text-muted m-0 px-4 py-6 text-[14px]">
              Nobody is in this group yet.
            </p>
          ) : (
            group.students.map((student, i) => (
              <div
                key={student.id}
                className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                style={
                  i > 0
                    ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" }
                    : undefined
                }
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: "var(--slate)" }}
                >
                  {student.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-title block truncate text-[13.5px] font-semibold">
                    {student.name}
                  </span>
                  <span className="text-faint block truncate font-mono text-[11.5px]">
                    {student.prn}
                  </span>
                </span>

                {canMark ? (
                  <span className="flex items-center gap-1">
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
                          className="plr-clip cursor-pointer rounded-lg px-2.5 py-1 text-[12px] font-semibold"
                          style={
                            on
                              ? { background: status.tone, color: "#fff" }
                              : {
                                  color: "var(--muted)",
                                  boxShadow: "var(--ring)",
                                }
                          }
                        >
                          {status.label}
                        </button>
                      );
                    })}
                  </span>
                ) : student.marked ? (
                  <Badge tone={markMeta(student.status)?.badge ?? "neutral"}>
                    {markMeta(student.status)?.label ?? "—"}
                  </Badge>
                ) : (
                  // The marking side seeds everyone as present, because that is
                  // how a register is taken. Reflecting that back at somebody
                  // who cannot mark would show an untaken register as a full
                  // house, so a reader is told there is nothing here instead.
                  <span className="text-faint text-[12px] font-semibold">
                    No register taken
                  </span>
                )}
              </div>
            ))
          )}
        </Card>

        {canMark && group.students.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-muted text-[12.5px]">
              {counts
                .filter((c) => c.count > 0)
                .map((c) => `${c.count} ${c.label.toLowerCase()}`)
                .join(" · ")}
            </span>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#3f6a2e]">
                <Icon name="checkCircle" size={15} color="#4e7d3a" stroke={2} />
                {saved}
              </span>
            )}
            {mark.error && (
              <span className="text-[12.5px] font-medium text-[#b02636]">
                {mark.error.message}
              </span>
            )}
            <button
              type="button"
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
              className="ml-auto rounded-[var(--radius-btn)] px-5 py-2.5 text-[14px] font-semibold text-white"
              style={{
                background: "var(--grad-brand)",
                opacity: mark.isPending ? 0.5 : 1,
                cursor: mark.isPending ? "not-allowed" : "pointer",
              }}
            >
              {mark.isPending
                ? "Saving…"
                : group.markedAt
                  ? "Update register"
                  : "Save register"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
