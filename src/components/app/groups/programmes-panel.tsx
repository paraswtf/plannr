"use client";

import { useEffect, useState } from "react";

import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Field, Input } from "~/components/ui/field";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { DeleteZone } from "./delete-zone";
import { Pager } from "./pager";

/**
 * Programmes: the broadest division of the student body.
 *
 * A programme is a degree — "BCA", "BBA-IT". Everything else hangs off one: an
 * intake belongs to a programme, and so does every division, major and elective
 * under it. That is why this tab exists at all; without a programme there is
 * nothing to file a batch or a group against.
 */
export function ProgrammesPanel({
  query,
  canManage,
  creating: creatingProp,
  onCreatingChange,
}: {
  query: string;
  canManage: boolean;
  /**
   * Whether the new-programme dialog is open, for a parent that draws the
   * create button in its own toolbar (the Groups screen does). Left out, the
   * panel draws its own button and keeps the state itself.
   */
  creating?: boolean;
  onCreatingChange?: (creating: boolean) => void;
}) {
  const [ownCreating, setOwnCreating] = useState(false);
  const creating = creatingProp ?? ownCreating;
  const setCreating = onCreatingChange ?? setOwnCreating;
  const [editing, setEditing] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // A new search starts from the first page. Without this, page 2 of a
  // three-row result is empty, the pager disappears with it, and the only way
  // out is to clear the box. Reset while rendering rather than in an effect, so
  // the new query is never sent with the old page.
  const [pagedQuery, setPagedQuery] = useState(query);
  if (pagedQuery !== query) {
    setPagedQuery(query);
    setPage(1);
  }
  const utils = api.useUtils();

  const courses = api.groups.programmeList.useQuery(
    { query: query || undefined, page, pageSize: 24 },
    { placeholderData: (previous) => previous },
  );
  const rows = courses.data?.rows ?? [];
  const lastPage = courses.data?.pageCount ?? 1;
  // Deleting the last programme on the final page leaves the page number past
  // the end. Placeholder data still carries the previous page count, so wait
  // for the real answer before stepping back.
  useEffect(() => {
    if (
      courses.data &&
      !courses.isPlaceholderData &&
      page > courses.data.pageCount
    ) {
      setPage(Math.max(1, courses.data.pageCount));
    }
  }, [courses.data, courses.isPlaceholderData, page]);

  return (
    <>
      {canManage && !onCreatingChange && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setCreating(true)}
          >
            New programme
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        courses.isLoading ? (
          <Card pad={0} className="overflow-hidden">
            <div role="status" aria-label="Loading programmes">
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-4 px-4 py-3.5 ${
                    i > 0 ? "shadow-[inset_0_1px_0_var(--hair-soft)]" : ""
                  }`}
                >
                  <span className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3 w-48" />
                  </span>
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="building"
              title={
                query ? "No programmes match that search" : "No programmes yet"
              }
              action={
                canManage && !query ? (
                  <Button
                    variant="primary"
                    icon="plus"
                    onClick={() => setCreating(true)}
                  >
                    New programme
                  </Button>
                ) : undefined
              }
            >
              {query
                ? undefined
                : "A programme is a degree the college runs, e.g. “BCA”. Batches and groups are filed under one."}
            </EmptyState>
          </Card>
        )
      ) : (
        // A short table rather than a grid of cards: four to six degrees in a
        // three-column grid left most of the screen as empty paper, for what
        // is two words and two numbers a line.
        <Card pad={0} className="overflow-hidden">
          {/* Column heads only where there are columns; on a phone the counts
              sit under the name, worded, and need none. */}
          <div className="text-muted text-2xs hidden items-center gap-4 px-4 py-2 font-semibold shadow-[inset_0_-1px_0_var(--hair-soft)] sm:flex">
            <span className="flex-1">Programme</span>
            <span className="w-[72px] text-right">Batches</span>
            <span className="w-[72px] text-right">Groups</span>
            {canManage && <span aria-hidden className="w-10 lg:w-8" />}
          </div>
          <ul aria-label="Programmes">
            {rows.map((course, i) => (
              <li
                key={course.id}
                className={`flex items-center gap-4 px-4 py-2.5 ${
                  i > 0 ? "shadow-[inset_0_1px_0_var(--hair-soft)]" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="font-display text-title block text-base font-semibold">
                    {course.code}
                  </span>
                  <span className="text-muted block truncate text-sm">
                    {course.name}
                  </span>
                  <span className="text-faint mt-0.5 block font-mono text-xs tabular-nums sm:hidden">
                    {course.batchCount}{" "}
                    {course.batchCount === 1 ? "batch" : "batches"},{" "}
                    {course.groupCount}{" "}
                    {course.groupCount === 1 ? "group" : "groups"}
                  </span>
                </span>
                <span className="text-muted hidden w-[72px] text-right font-mono text-sm tabular-nums sm:block">
                  {course.batchCount}
                </span>
                <span className="text-muted hidden w-[72px] text-right font-mono text-sm tabular-nums sm:block">
                  {course.groupCount}
                </span>
                {canManage && (
                  <IconButton
                    icon="settings"
                    label={`Edit ${course.code}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(course.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Pager
        page={page}
        lastPage={lastPage}
        onPrevious={() => setPage((n) => n - 1)}
        onNext={() => setPage((n) => n + 1)}
      />

      {creating && (
        <CourseDialog
          onClose={() => setCreating(false)}
          onSaved={() => utils.groups.invalidate()}
        />
      )}
      {editing && (
        <CourseDialog
          course={rows.find((c) => c.id === editing)}
          onClose={() => setEditing(null)}
          onSaved={() => utils.groups.invalidate()}
        />
      )}
    </>
  );
}

interface EditableCourse {
  id: string;
  code: string;
  name: string;
  groupCount: number;
  batchCount: number;
}

function CourseDialog({
  course,
  onClose,
  onSaved,
}: {
  course?: EditableCourse;
  onClose: () => void;
  onSaved: () => void | Promise<unknown>;
}) {
  const [code, setCode] = useState(course?.code ?? "");
  const [name, setName] = useState(course?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    await onSaved();
    onClose();
  };
  const create = api.groups.createCourse.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const update = api.groups.updateCourse.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const remove = api.groups.deleteCourse.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });

  const ready = code.trim().length > 0 && name.trim().length > 0;
  const saving = create.isPending || update.isPending;
  // A programme holding anything cannot be removed; saying so up front beats
  // offering a button that only ever produces an error.
  const attached = (course?.groupCount ?? 0) + (course?.batchCount ?? 0);

  return (
    <Dialog
      open
      icon="book"
      // "Programme", the word on the tab and the button that opens this; the
      // dialog used to call the same thing a course, which on /courses means
      // a subject.
      title={course ? `Edit ${course.code}` : "New programme"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ready || saving}
            onClick={() => {
              setError(null);
              const input = { code: code.trim(), name: name.trim() };
              if (course) update.mutate({ id: course.id, ...input });
              else create.mutate(input);
            }}
          >
            {saving ? "Saving…" : course ? "Save changes" : "Create programme"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}

        <Field label="Code" hint="Short and unique, e.g. BCA. Shown on cards.">
          {(id) => (
            <Input
              id={id}
              value={code}
              autoFocus={!course}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. BCA"
              className="font-mono"
            />
          )}
        </Field>

        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bachelor of Computer Applications"
            />
          )}
        </Field>

        {course && (
          <DeleteZone
            subject={course.code}
            pending={remove.isPending}
            onDelete={() => remove.mutate({ id: course.id })}
            locked={attached > 0}
          >
            {attached > 0 ? (
              <>
                {course.code} holds {course.batchCount}{" "}
                {course.batchCount === 1 ? "batch" : "batches"} and{" "}
                {course.groupCount}{" "}
                {course.groupCount === 1 ? "group" : "groups"}. Move or delete
                them before the programme can go. Deleting it would take their
                students and timetables with it.
              </>
            ) : (
              "Nothing is filed under this programme."
            )}
          </DeleteZone>
        )}
      </div>
    </Dialog>
  );
}
