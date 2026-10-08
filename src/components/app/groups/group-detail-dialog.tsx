"use client";

import { useState } from "react";

import { Avatar } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button, buttonClass } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon } from "~/components/ui/icon";
import {
  EntityPicker,
  pickerPage,
  useDebounced,
} from "~/components/ui/entity-picker";
import { Field, Textarea } from "~/components/ui/field";
import { Segmented } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
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
  // Whether the paste box is open. Unset until someone toggles it, so an
  // empty group opens straight onto adding people and a full one onto its
  // list; after that it stays however it was left.
  const [adding, setAdding] = useState<boolean | null>(null);

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
  const showAdd =
    canManage && (adding ?? (data ? data.students.length === 0 : false));

  // One line of facts under the title, in place of four badges in four
  // colours that each said one of these and competed with the tabs for the
  // eye. Lectures, not "classes", which is what the tab below calls them.
  const subtitle = data
    ? [
        data.programme.code,
        data.semester?.name,
        `${data.students.length} ${data.students.length === 1 ? "student" : "students"}`,
        data.eventCount > 0
          ? `${data.eventCount} ${data.eventCount === 1 ? "lecture" : "lectures"}`
          : null,
      ]
        .filter(Boolean)
        .join(", ")
    : undefined;

  return (
    <Dialog
      open
      title={data?.label ?? "Group"}
      subtitle={subtitle}
      icon="layers"
      width={660}
      onClose={onClose}
      footer={
        // Deleting is not one of the things to look at in a group, so it is
        // not a tab beside them any more: it is a quiet red button at the
        // foot, which opens the confirmation in place of the tab's content.
        data && canManage && tab !== "danger" ? (
          <Button
            variant="danger-quiet"
            icon="trash"
            className="sm:mr-auto"
            onClick={() => {
              setTab("danger");
              setConfirmDelete(true);
            }}
          >
            Delete group
          </Button>
        ) : undefined
      }
    >
      {!data ? (
        <div
          role="status"
          aria-label="Loading group"
          className="flex flex-col gap-3"
        >
          <Skeleton className="h-9 w-64 rounded-[11px]" />
          <Skeleton className="h-40 w-full rounded-[12px]" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Three tabs fit a phone-width dialog; the strip still scrolls
              inside itself should a longer label ever overrun it. */}
          <Segmented
            items={[
              { value: "students" as const, label: "Students" },
              { value: "lectures" as const, label: "Lectures" },
              { value: "faculty" as const, label: "Faculty" },
            ]}
            value={tab}
            onChange={(next) => {
              setTab(next);
              setConfirmDelete(false);
            }}
            size="sm"
            ariaLabel="Group details"
          />

          {error && (
            <Callout tone="bad" role="alert">
              {error}
            </Callout>
          )}
          {result && (
            <Callout tone="info" role="status" title={result}>
              {notFound.length > 0 && (
                <span className="text-warn font-mono text-xs">
                  Not found: {notFound.slice(0, 8).join(", ")}
                  {notFound.length > 8 && ` +${notFound.length - 8} more`}
                </span>
              )}
            </Callout>
          )}

          {tab === "students" && (
            <>
              {/* The list is what a group is opened for, so it leads; adding
                  and removing are actions on it, gathered on one line above
                  it rather than a form pushing it down the dialog. */}
              {canManage && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {selected.size > 0 && (
                    <Button
                      variant="danger"
                      size="sm"
                      icon="trash"
                      className="mr-auto"
                      disabled={removeMembers.isPending}
                      onClick={() =>
                        removeMembers.mutate({
                          groupId,
                          studentIds: [...selected],
                        })
                      }
                    >
                      {removeMembers.isPending
                        ? "Removing…"
                        : `Remove ${selected.size} selected`}
                    </Button>
                  )}
                  <Button
                    variant={showAdd ? "ghost" : "secondary"}
                    size="sm"
                    icon="plus"
                    aria-expanded={showAdd}
                    // The panel is only mounted while it is open, so the
                    // button points at it only then; a dangling id would name
                    // a region that is not there.
                    aria-controls={showAdd ? "group-add-students" : undefined}
                    onClick={() => setAdding(!showAdd)}
                  >
                    Add students
                  </Button>
                </div>
              )}

              {showAdd && (
                <div
                  id="group-add-students"
                  className="bg-tint-hover flex flex-col gap-3 rounded-[12px] p-3.5 shadow-[inset_0_0_0_1px_var(--hair-soft)]"
                >
                  <Field label="Add students">
                    {(id) => (
                      <Textarea
                        id={id}
                        value={paste}
                        onChange={(e) => setPaste(e.target.value)}
                        rows={3}
                        placeholder="Paste emails or PRNs, one per line or comma separated"
                        className="font-mono"
                      />
                    )}
                  </Field>
                  <Button
                    variant="primary"
                    size="sm"
                    className="self-start"
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
                  >
                    Add to group
                  </Button>
                </div>
              )}

              {data.students.length === 0 ? (
                <EmptyState
                  compact
                  icon="users"
                  title="No students in this group yet"
                  className="rounded-[12px] shadow-[inset_0_0_0_1px_var(--hair)]"
                />
              ) : (
                // A list box of its own, so the tabs stay in view while a
                // sixty-name division scrolls. The ring sits on a padded
                // wrapper so a hovered row's wash cannot paint over it.
                <div className="rounded-[12px] p-px shadow-[inset_0_0_0_1px_var(--hair)]">
                  <ul
                    aria-label="Students"
                    className="plr-scroll max-h-[320px] overflow-y-auto rounded-[11px]"
                  >
                    {data.students.map((s, i) => {
                      const on = selected.has(s.id);
                      return (
                        <li
                          key={s.id}
                          className={
                            i > 0
                              ? "shadow-[inset_0_1px_0_var(--hair-soft)]"
                              : ""
                          }
                        >
                          <div
                            className={`flex min-h-11 items-center gap-3 px-3 transition-colors ${
                              canManage
                                ? on
                                  ? "bg-tint-selected"
                                  : "hover:bg-tint-hover"
                                : ""
                            }`}
                          >
                            {canManage && (
                              // The box and the rest of the row are two labels
                              // of the one input, so the whole row is the
                              // target without a label nested in a label.
                              <Checkbox
                                id={`member-${s.id}`}
                                ariaLabel={`Select ${personName(s, s.prn)}`}
                                className="shrink-0"
                                checked={on}
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
                            <label
                              htmlFor={canManage ? `member-${s.id}` : undefined}
                              className={`flex min-w-0 flex-1 items-center gap-3 py-2 ${
                                canManage ? "cursor-pointer" : ""
                              }`}
                            >
                              <Avatar name={personName(s, s.prn)} size={28} />
                              <span className="min-w-0 flex-1">
                                <span className="text-title block truncate text-sm font-semibold">
                                  {personName(s, s.prn)}
                                </span>
                                <PersonAddress email={s.email} />
                              </span>
                              <span className="text-muted shrink-0 font-mono text-xs tabular-nums">
                                {s.prn}
                              </span>
                            </label>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
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
              <p className="text-muted text-sm">
                Who teaches this group. Scheduling a class for them checks their
                availability.
              </p>
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
                page={pickerPage(faculty.data, (rows) => rows.map(facultyCard))}
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
            <Callout tone="bad" icon="trash" title="Delete this group">
              <p>
                {data.eventCount > 0 ? (
                  <>
                    This group has <b>{data.eventCount}</b> scheduled{" "}
                    {data.eventCount === 1 ? "lecture" : "lectures"}. Deleting
                    it removes them from the timetable too.
                  </>
                ) : (
                  <>
                    It has no scheduled lectures. Its {data.students.length}{" "}
                    student {data.students.length === 1 ? "link" : "links"} will
                    be removed; the people themselves stay.
                  </>
                )}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() =>
                    confirmDelete
                      ? remove.mutate({ id: groupId, confirmCascade: true })
                      : setConfirmDelete(true)
                  }
                >
                  {remove.isPending
                    ? "Deleting…"
                    : confirmDelete
                      ? `Yes, delete ${data.label}`
                      : "Delete group"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirmDelete(false);
                    setTab("students");
                  }}
                >
                  Keep
                </Button>
              </div>
            </Callout>
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
  // A page rather than the group's whole timetable, as it has always been:
  // sixty sittings is a term's worth of the recent ones and the panel scrolls
  // through them without a pager.
  const lectures = api.groups.lectures.useQuery({ groupId, pageSize: 60 });
  const rows = lectures.data?.rows ?? [];

  if (lectures.isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading lectures"
        className="flex flex-col gap-2"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-[10px]" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon="calendar"
        title="Nothing timetabled for this group yet"
        className="rounded-[12px] shadow-[inset_0_0_0_1px_var(--hair)]"
      >
        Schedule a class from the timetable and pick this group.
      </EmptyState>
    );
  }

  return (
    // One list with hairlines rather than a ringed card per sitting, which
    // put sixty boxes inside a dialog. On a phone a row is three lines (when,
    // what, then where and the register) so the subject is never the thing
    // cut short; from sm it is one line of fixed columns, so the titles all
    // start at the same x.
    <div className="rounded-[12px] p-px shadow-[inset_0_0_0_1px_var(--hair)]">
      <ul
        aria-label="Lectures"
        className="plr-scroll max-h-[46vh] overflow-y-auto rounded-[11px]"
      >
        {rows.map((lecture, i) => (
          <li
            key={lecture.occurrenceId}
            className={`flex flex-col gap-1 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-3 ${
              i > 0 ? "shadow-[inset_0_1px_0_var(--hair-soft)]" : ""
            }`}
          >
            <span className="flex shrink-0 items-baseline gap-3">
              <span className="text-title font-mono text-xs font-semibold sm:w-[84px]">
                {formatDayLabel(lecture.start, DEFAULT_TIMEZONE)}
              </span>
              <span className="text-muted font-mono text-xs sm:w-[40px]">
                {formatHourLabel(lecture.start, DEFAULT_TIMEZONE)}
              </span>
            </span>
            <span className="min-w-0 sm:flex-1">
              <span className="text-title block text-sm font-semibold sm:truncate">
                {lecture.title}
              </span>
              {lecture.sharedWith.length > 0 && (
                <span className="text-muted block text-xs sm:truncate">
                  Shared with {lecture.sharedWith.join(", ")}
                </span>
              )}
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge tone="slate">{lecture.roomCode}</Badge>
              {lecture.attendance ? (
                <Badge tone="green">
                  {lecture.attendance.present}/{lecture.attendance.total}
                </Badge>
              ) : (
                <span className="text-muted text-xs">No register</span>
              )}
              {canMarkAttendance && (
                <Link
                  href={`/attendance/${lecture.occurrenceId}`}
                  // A register still to take is the one that wants doing, so
                  // it looks pressable at rest; an update is there if needed.
                  className={buttonClass(
                    lecture.attendance ? "ghost" : "quiet",
                    "sm",
                    "ml-auto gap-1 sm:ml-0",
                  )}
                >
                  {lecture.attendance ? "Update" : "Take"}
                  <Icon name="chevronRight" size={14} stroke={2} />
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
