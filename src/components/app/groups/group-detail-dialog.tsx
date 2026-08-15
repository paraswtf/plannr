"use client";

import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { EntityPicker, useDebounced } from "~/components/ui/entity-picker";
import { Segmented } from "~/components/ui/segmented";
import Link from "next/link";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { facultyCard } from "~/components/app/people/entity-cards";
import { PersonAddress } from "~/components/app/people/person-address";
import { personName } from "~/lib/people";
import { api } from "~/trpc/react";

/** Members, teaching staff, and deletion — everything about one group. */
export function GroupDetailDialog({
  groupId,
  canManage,
  canMarkAttendance = false,
  onClose,
}: {
  groupId: string;
  canManage: boolean;
  /** Whether the lectures list links through to the register. */
  canMarkAttendance?: boolean;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const group = api.groups.byId.useQuery({ id: groupId });
  const [facultyQuery, setFacultyQuery] = useState("");
  const [facultyPageSize, setFacultyPageSize] = useState(20);
  const debouncedFaculty = useDebounced(facultyQuery);
  const assignedFacultyIds = group.data?.faculty.map((f) => f.id) ?? [];
  const faculty = api.groups.facultyList.useQuery({
    query: debouncedFaculty || undefined,
    pageSize: facultyPageSize,
    // Pins whoever is already assigned so a search cannot hide them.
    includeIds: assignedFacultyIds,
  });

  const [tab, setTab] = useState<
    "students" | "lectures" | "faculty" | "danger"
  >("students");
  const [paste, setPaste] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = async () => {
    await utils.groups.invalidate();
    setError(null);
  };
  const onError = (e: { message: string }) => setError(e.message);

  const addMembers = api.groups.addMembers.useMutation({
    onSuccess: async (r) => {
      await refresh();
      setPaste("");
      setNotFound(r.notFound);
      setResult(
        `Added ${r.added.length}. ${r.alreadyMembers} already in the group.` +
          (r.notFound.length ? ` ${r.notFound.length} not found.` : ""),
      );
    },
    onError,
  });
  const removeMembers = api.groups.removeMembers.useMutation({
    onSuccess: async (r) => {
      await refresh();
      setSelected(new Set());
      setResult(`Removed ${r.removed}.`);
    },
    onError,
  });
  const setFaculty = api.groups.setFaculty.useMutation({
    onSuccess: refresh,
    onError,
  });
  const remove = api.groups.delete.useMutation({
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError,
  });

  const data = group.data;

  return (
    <Dialog
      open
      title={data?.label ?? "Group"}
      icon="layers"
      width={660}
      onClose={onClose}
    >
      {!data ? (
        <p className="text-muted text-[13.5px]">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="orange">{data.programme.code}</Badge>
            {data.semester && <Badge tone="neutral">{data.semester.name}</Badge>}
            <Badge tone="green" dot>
              {data.students.length} students
            </Badge>
            {data.eventCount > 0 && (
              <Badge tone="slate">{data.eventCount} classes</Badge>
            )}
          </div>

          <Segmented
            items={[
              { value: "students" as const, label: "Students" },
              { value: "lectures" as const, label: "Lectures" },
              { value: "faculty" as const, label: "Faculty" },
              ...(canManage
                ? [{ value: "danger" as const, label: "Delete" }]
                : []),
            ]}
            value={tab}
            onChange={setTab}
            size="sm"
          />

          {error && (
            <div
              className="rounded-xl p-3 text-[13px] font-medium text-[#b02636]"
              style={{
                background: "rgba(220,56,72,0.07)",
                boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
              }}
            >
              {error}
            </div>
          )}
          {result && (
            <div
              className="text-ink rounded-xl p-3 text-[12.5px]"
              style={{
                background: "rgba(68,88,121,0.07)",
                boxShadow: "inset 0 0 0 1px var(--card-ring)",
              }}
            >
              {result}
              {notFound.length > 0 && (
                <div className="mt-1.5 font-mono text-[11.5px] text-[#a2660f]">
                  Not found: {notFound.slice(0, 8).join(", ")}
                  {notFound.length > 8 && ` +${notFound.length - 8} more`}
                </div>
              )}
            </div>
          )}

          {tab === "students" && (
            <>
              {canManage && (
                <div className="flex flex-col gap-2">
                  <span className="text-ink text-[13px] font-semibold">
                    Add students
                  </span>
                  <textarea
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    rows={3}
                    placeholder="Paste emails or PRNs, one per line or comma separated"
                    className="bg-surface w-full resize-y rounded-[10px] px-3 py-2 font-mono text-[12.5px] outline-none"
                    style={{ boxShadow: "var(--ring)" }}
                  />
                  <button
                    type="button"
                    disabled={!paste.trim() || addMembers.isPending}
                    onClick={() =>
                      addMembers.mutate({
                        groupId,
                        identifiers: paste
                          .split(/[\s,;]+/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="self-start rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white"
                    style={{
                      background: "var(--slate)",
                      opacity: paste.trim() ? 1 : 0.5,
                      cursor: paste.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    Add to group
                  </button>
                </div>
              )}

              {canManage && selected.size > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    removeMembers.mutate({
                      groupId,
                      studentIds: [...selected],
                    })
                  }
                  className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white"
                  style={{ background: "var(--red)" }}
                >
                  <Icon name="trash" size={13} color="#fff" />
                  Remove {selected.size} selected
                </button>
              )}

              <div
                className="plr-scroll max-h-[280px] overflow-y-auto rounded-[10px]"
                style={{ boxShadow: "var(--ring)" }}
              >
                {data.students.length === 0 ? (
                  <p className="text-muted p-4 text-[13px]">
                    No students in this group yet.
                  </p>
                ) : (
                  data.students.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                      style={{ boxShadow: "inset 0 -1px 0 var(--hair-soft)" }}
                    >
                      {canManage && (
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(s.id)) next.delete(s.id);
                              else next.add(s.id);
                              return next;
                            })
                          }
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="text-title block truncate text-[13.5px] font-semibold">
                          {personName(s, s.prn)}
                        </span>
                        <PersonAddress email={s.email} />
                      </span>
                      <span className="text-muted font-mono text-[12px]">
                        {s.prn}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </>
          )}

          {tab === "lectures" && (
            <GroupLectures
              groupId={groupId}
              canMarkAttendance={canMarkAttendance}
            />
          )}

          {tab === "faculty" && (
            <div className="flex flex-col gap-3">
              <span className="text-muted text-[12.5px]">
                Who teaches this group. Scheduling a class for them checks their
                availability.
              </span>
              <EntityPicker
                selected={data.faculty.map((f) =>
                  facultyCard({
                    id: f.id,
                    name: f.name,
                    email: f.email,
                    department: f.department,
                  }),
                )}
                onChange={(facultyIds) =>
                  setFaculty.mutate({ groupId, facultyIds })
                }
                page={
                  faculty.data && {
                    ...faculty.data,
                    rows: faculty.data.rows.map(facultyCard),
                  }
                }
                loading={faculty.isLoading}
                query={facultyQuery}
                onQueryChange={setFacultyQuery}
                onLoadMore={() => setFacultyPageSize((n) => n + 20)}
                disabled={!canManage}
                placeholder="Search faculty by name or department…"
                listId="group-faculty"
                emptyLabel="No faculty assigned"
              />
            </div>
          )}

          {tab === "danger" && canManage && (
            <div
              className="flex flex-col gap-3 rounded-xl p-4"
              style={{
                background: "rgba(220,56,72,0.05)",
                boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.25)",
              }}
            >
              <span className="text-[13.5px] font-bold text-[#b02636]">
                Delete this group
              </span>
              <span className="text-ink text-[12.5px]">
                {data.eventCount > 0 ? (
                  <>
                    This group has <b>{data.eventCount}</b> scheduled{" "}
                    {data.eventCount === 1 ? "class" : "classes"}. Deleting it
                    removes them from the timetable too.
                  </>
                ) : (
                  <>
                    It has no scheduled classes. Its {data.students.length}{" "}
                    student {data.students.length === 1 ? "link" : "links"} will
                    be removed; the people themselves stay.
                  </>
                )}
              </span>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() =>
                  confirmDelete
                    ? remove.mutate({ id: groupId, confirmCascade: true })
                    : setConfirmDelete(true)
                }
                className="cursor-pointer self-start rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white"
                style={{ background: "var(--red)" }}
              >
                {confirmDelete ? `Yes, delete ${data.label}` : "Delete group"}
              </button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

/**
 * What this group is timetabled for, and whether the register has been taken.
 *
 * Reads sittings rather than events: a weekly class is twelve lines here, which
 * is the grain attendance is kept at.
 */
function GroupLectures({
  groupId,
  canMarkAttendance,
}: {
  groupId: string;
  canMarkAttendance: boolean;
}) {
  const lectures = api.groups.lectures.useQuery({ groupId, limit: 60 });
  const rows = lectures.data ?? [];

  if (lectures.isLoading) {
    return <p className="text-muted m-0 text-[13.5px]">Loading…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-muted m-0 text-[13.5px]">
        Nothing timetabled for this group yet. Schedule a class from the
        timetable and pick this group.
      </p>
    );
  }

  return (
    <div className="plr-scroll flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto">
      {rows.map((lecture) => (
        <div
          key={lecture.occurrenceId}
          className="bg-surface flex flex-wrap items-center gap-2.5 rounded-[10px] px-3 py-2"
          style={{ boxShadow: "var(--ring)" }}
        >
          <span className="text-title min-w-[92px] font-mono text-[12px] font-bold">
            {formatDayLabel(lecture.start, DEFAULT_TIMEZONE)}
          </span>
          <span className="text-muted font-mono text-[12px]">
            {formatHourLabel(lecture.start, DEFAULT_TIMEZONE)}
          </span>
          <span className="text-title min-w-0 flex-1 truncate text-[13px] font-semibold">
            {lecture.title}
          </span>
          <Badge tone="slate">{lecture.roomCode}</Badge>
          {lecture.sharedWith.length > 0 && (
            <Badge tone="orange">with {lecture.sharedWith.join(", ")}</Badge>
          )}
          {lecture.attendance ? (
            <Badge tone="green" dot>
              {lecture.attendance.present}/{lecture.attendance.total}
            </Badge>
          ) : (
            <span className="text-faint text-[11.5px]">no register</span>
          )}
          {canMarkAttendance && (
            <Link
              href={`/attendance/${lecture.occurrenceId}`}
              className="text-slate text-[12.5px] font-bold"
            >
              {lecture.attendance ? "Update" : "Take"} →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
