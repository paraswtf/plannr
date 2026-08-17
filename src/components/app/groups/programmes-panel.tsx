"use client";

import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { api } from "~/trpc/react";

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
}: {
  query: string;
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const utils = api.useUtils();

  const courses = api.groups.programmeList.useQuery(
    { query: query || undefined, page, pageSize: 24 },
    { placeholderData: (previous) => previous },
  );
  const rows = courses.data?.rows ?? [];

  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-10 cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
            style={{ background: "var(--grad-brand)" }}
          >
            + New programme
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <p className="text-muted m-0 text-[14px]">
            {courses.isLoading
              ? "Loading…"
              : query
                ? "No courses match that search."
                : "No courses yet. A course is a programme the institution runs, e.g. “BCA”. Batches and groups are filed under one."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {rows.map((course) => (
            <Card key={course.id} pad={18} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-display text-title block text-[17px] font-bold">
                    {course.code}
                  </span>
                  <span className="text-muted mt-0.5 block text-[12.5px]">
                    {course.name}
                  </span>
                </span>
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Edit ${course.code}`}
                    onClick={() => setEditing(course.id)}
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-7 lg:w-7"
                    style={{ background: "rgba(68,88,121,0.07)" }}
                  >
                    <Icon
                      name="settings"
                      size={13}
                      color="var(--slate)"
                      stroke={2}
                    />
                  </button>
                )}
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-2">
                <Badge tone="orange">
                  {course.batchCount}{" "}
                  {course.batchCount === 1 ? "batch" : "batches"}
                </Badge>
                <Badge tone="slate">
                  {course.groupCount}{" "}
                  {course.groupCount === 1 ? "group" : "groups"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(courses.data?.pageCount ?? 1) > 1 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((n) => n - 1)}
            className="min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold lg:min-h-0"
            style={{ boxShadow: "var(--ring)", opacity: page === 1 ? 0.4 : 1 }}
          >
            Previous
          </button>
          <span className="text-faint font-mono text-[12px]">
            page {page} of {courses.data?.pageCount}
          </span>
          <button
            type="button"
            disabled={!courses.data?.hasMore}
            onClick={() => setPage((n) => n + 1)}
            className="min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold lg:min-h-0"
            style={{
              boxShadow: "var(--ring)",
              opacity: courses.data?.hasMore ? 1 : 0.4,
            }}
          >
            Next
          </button>
        </div>
      )}

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
  const [confirmDelete, setConfirmDelete] = useState(false);

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
  // A course holding anything cannot be removed; saying so up front beats
  // offering a button that only ever produces an error.
  const attached = (course?.groupCount ?? 0) + (course?.batchCount ?? 0);

  return (
    <Dialog
      open
      icon="book"
      title={course ? `Edit ${course.code}` : "New course"}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="text-muted min-h-10 cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || saving}
            onClick={() => {
              setError(null);
              const input = { code: code.trim(), name: name.trim() };
              if (course) update.mutate({ id: course.id, ...input });
              else create.mutate(input);
            }}
            className="min-h-10 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
            style={{
              background: "var(--grad-brand)",
              opacity: ready && !saving ? 1 : 0.5,
              cursor: ready && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving…" : course ? "Save changes" : "Create course"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
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

        <Field label="Code" hint="Short and unique, e.g. BCA. Shown on cards.">
          <input
            value={code}
            autoFocus={!course}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. BCA"
            // 16px on a phone: below that, Safari zooms the page in as the
            // field takes focus, which on a dialog leaves it half off screen.
            className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 font-mono text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Field>

        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bachelor of Computer Applications"
            className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Field>

        {course && (
          <div
            className="mt-1 rounded-xl p-3"
            style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}
          >
            {attached > 0 ? (
              <span className="text-muted text-[12.5px]">
                {course.code} holds {course.batchCount}{" "}
                {course.batchCount === 1 ? "batch" : "batches"} and{" "}
                {course.groupCount}{" "}
                {course.groupCount === 1 ? "group" : "groups"}. Move or delete
                them before the course itself can go — deleting it would take
                their students and timetables with it.
              </span>
            ) : !confirmDelete ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-muted text-[12.5px]">
                  Nothing is filed under this course.
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-10 shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-[#b02636] lg:min-h-0"
                  style={{ boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)" }}
                >
                  Delete
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-ink text-[12.5px]">
                  Delete {course.code}?
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-muted min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold lg:min-h-0"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: course.id })}
                    className="min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white lg:min-h-0"
                    style={{ background: "var(--red)" }}
                  >
                    {remove.isPending ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="text-faint text-[11.5px]">{hint}</span>}
    </div>
  );
}
