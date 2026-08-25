"use client";

import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import {
  pickerPage,
  SearchSelect,
  useDebounced,
} from "~/components/ui/entity-picker";
import { Icon } from "~/components/ui/icon";
import { api } from "~/trpc/react";
import { programmeCard } from "./entity-cards";
import { GROUP_KINDS, KIND_LABEL, KIND_TONE } from "./group-vocab";

/**
 * Intakes and what each is split into.
 *
 * A batch — "23-27 BBA-IT" — is the cohort admitted to a course in one year. It
 * outlives any term, which is why it is not just another group: the divisions,
 * majors, minors and electives underneath it change from semester to semester
 * while the intake itself does not.
 */
export function BatchesPanel({
  query,
  canManage,
  onOpenGroup,
}: {
  query: string;
  canManage: boolean;
  onOpenGroup: (groupId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const utils = api.useUtils();

  const batches = api.groups.batchList.useQuery(
    { query: query || undefined },
    { placeholderData: (previous) => previous },
  );
  const rows = batches.data?.rows ?? [];

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
            + New batch
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <p className="text-muted m-0 text-[14px]">
            {batches.isLoading
              ? "Loading…"
              : query
                ? "No batches match that search."
                : "No batches yet. A batch is one year's intake for a course, e.g. “23-27 BBA-IT”."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((batch) => (
            <Card key={batch.id} pad={18} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-display text-title text-[17px] font-bold">
                  {batch.name}
                </span>
                <Badge tone="orange">{batch.courseCode}</Badge>
                <span className="text-faint font-mono text-[12px]">
                  {batch.startYear}–{batch.endYear}
                </span>
                <Badge tone="green" dot>
                  {batch.studentCount} students
                </Badge>
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Edit ${batch.name}`}
                    onClick={() => setEditing(batch.id)}
                    // A 28px chip is fine under a mouse and too small for a
                    // thumb, so the chip itself grows where there is no mouse.
                    className="ml-auto flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-7 lg:w-7"
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

              {batch.groups.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {batch.groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => onOpenGroup(group.id)}
                      className="plr-clip bg-surface flex min-h-10 max-w-full cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left lg:min-h-0"
                      style={{ boxShadow: "var(--ring)" }}
                    >
                      <Badge tone={KIND_TONE[group.kind]}>
                        {KIND_LABEL[group.kind]}
                      </Badge>
                      <span className="text-title min-w-0 truncate text-[12.5px] font-semibold">
                        {group.label}
                      </span>
                      <span className="text-faint shrink-0 font-mono text-[11.5px]">
                        {group.studentCount}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-faint m-0 text-[12.5px]">
                  Nothing under this batch yet — add a group and file it here.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <BatchDialog
          onClose={() => setCreating(false)}
          onSaved={() => utils.groups.invalidate()}
        />
      )}
      {editing && (
        <BatchDialog
          batch={rows.find((b) => b.id === editing)}
          onClose={() => setEditing(null)}
          onSaved={() => utils.groups.invalidate()}
        />
      )}
    </>
  );
}

interface EditableBatch {
  id: string;
  name: string;
  programmeId: string;
  startYear: number;
  endYear: number;
}

function BatchDialog({
  batch,
  onClose,
  onSaved,
}: {
  batch?: EditableBatch;
  onClose: () => void;
  onSaved: () => void | Promise<unknown>;
}) {
  const [name, setName] = useState(batch?.name ?? "");
  const [programmeId, setCourseId] = useState(batch?.programmeId ?? "");
  const [startYear, setStartYear] = useState(
    String(batch?.startYear ?? new Date().getFullYear()),
  );
  const [endYear, setEndYear] = useState(
    String(batch?.endYear ?? new Date().getFullYear() + 3),
  );
  const [programmeQuery, setProgrammeQuery] = useState("");
  const [coursePageSize, setCoursePageSize] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const courses = api.groups.programmeList.useQuery({
    query: useDebounced(programmeQuery) || undefined,
    pageSize: coursePageSize,
    includeIds: programmeId ? [programmeId] : undefined,
  });
  const selectedProgramme = courses.data?.rows.find(
    (c) => c.id === programmeId,
  );

  const done = async () => {
    await onSaved();
    onClose();
  };
  const create = api.groups.createBatch.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const update = api.groups.updateBatch.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const remove = api.groups.deleteBatch.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });

  // The name is what people actually call the intake, so it is suggested from
  // the years and the course rather than composed behind their back.
  const suggested =
    selectedProgramme && startYear.length === 4 && endYear.length === 4
      ? `${startYear.slice(2)}-${endYear.slice(2)} ${selectedProgramme.code}`
      : "";

  const ready =
    name.trim().length > 0 &&
    programmeId.length > 0 &&
    Number(startYear) > 1900 &&
    Number(endYear) >= Number(startYear);
  const saving = create.isPending || update.isPending;

  return (
    <Dialog
      open
      icon="layers"
      title={batch ? `Edit ${batch.name}` : "New batch"}
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
              const input = {
                name: name.trim(),
                programmeId,
                startYear: Number(startYear),
                endYear: Number(endYear),
              };
              if (batch) update.mutate({ id: batch.id, ...input });
              else create.mutate(input);
            }}
            className="min-h-10 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
            style={{
              background: "var(--grad-brand)",
              opacity: ready && !saving ? 1 : 0.5,
              cursor: ready && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving…" : batch ? "Save changes" : "Create batch"}
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

        <Field label="Course">
          <SearchSelect
            value={selectedProgramme ? programmeCard(selectedProgramme) : null}
            onChange={(id) => setCourseId(id ?? "")}
            page={pickerPage(courses.data, (rows) => rows.map(programmeCard))}
            loading={courses.isLoading}
            query={programmeQuery}
            onQueryChange={setProgrammeQuery}
            onLoadMore={() => setCoursePageSize((n) => n + 20)}
            placeholder="Search courses…"
            listId="batch-course"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input
              value={startYear}
              inputMode="numeric"
              onChange={(e) => setStartYear(e.target.value)}
              // 16px on a phone: below that, Safari zooms the page in as the
              // field takes focus, which on a dialog leaves it half off screen.
              className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 font-mono text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
              style={{ boxShadow: "var(--ring)" }}
            />
          </Field>
          <Field label="Finishes">
            <input
              value={endYear}
              inputMode="numeric"
              onChange={(e) => setEndYear(e.target.value)}
              className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 font-mono text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
              style={{ boxShadow: "var(--ring)" }}
            />
          </Field>
        </div>

        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 23-27 BBA-IT"
            className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
          {suggested && suggested !== name && (
            <button
              type="button"
              onClick={() => setName(suggested)}
              className="text-slate inline-flex min-h-10 items-center self-start text-[12px] font-semibold lg:min-h-0"
            >
              Use “{suggested}”
            </button>
          )}
        </Field>

        {batch && (
          <div
            className="mt-1 rounded-xl p-3"
            style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}
          >
            {!confirmDelete ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-muted text-[12.5px]">
                  Deleting the batch leaves its groups in place; they simply
                  stop belonging to an intake.
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
                  Delete {batch.name}?
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
                    onClick={() => remove.mutate({ id: batch.id })}
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

/** The kinds, for the group form to offer. */
export const KIND_OPTIONS = GROUP_KINDS.map((kind) => ({
  value: kind,
  label: KIND_LABEL[kind],
}));

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      {children}
    </div>
  );
}
