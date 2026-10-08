"use client";

import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import {
  pickerPage,
  SearchSelect,
  useDebounced,
} from "~/components/ui/entity-picker";
import { Field, Input } from "~/components/ui/field";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { DeleteZone } from "./delete-zone";
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
  creating: creatingProp,
  onCreatingChange,
}: {
  query: string;
  canManage: boolean;
  onOpenGroup: (groupId: string) => void;
  /**
   * Whether the new-batch dialog is open, for a parent that draws the create
   * button in its own toolbar (the Groups screen does). Left out, the panel
   * draws its own button and keeps the state itself.
   */
  creating?: boolean;
  onCreatingChange?: (creating: boolean) => void;
}) {
  const [ownCreating, setOwnCreating] = useState(false);
  const creating = creatingProp ?? ownCreating;
  const setCreating = onCreatingChange ?? setOwnCreating;
  const [editing, setEditing] = useState<string | null>(null);
  const utils = api.useUtils();

  const batches = api.groups.batchList.useQuery(
    { query: query || undefined },
    { placeholderData: (previous) => previous },
  );
  const rows = batches.data?.rows ?? [];

  return (
    <>
      {canManage && !onCreatingChange && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setCreating(true)}
          >
            New batch
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        batches.isLoading ? (
          <Card pad={0} className="overflow-hidden">
            <div role="status" aria-label="Loading batches">
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className={`flex flex-col gap-3 px-4 py-4 sm:px-5 ${
                    i > 0 ? "shadow-[inset_0_1px_0_var(--hair-soft)]" : ""
                  }`}
                >
                  <Skeleton className="h-4 w-32" />
                  <span className="flex gap-2">
                    <Skeleton className="h-8 w-36" />
                    <Skeleton className="h-8 w-36" />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="users"
              title={query ? "No batches match that search" : "No batches yet"}
              action={
                canManage && !query ? (
                  <Button
                    variant="primary"
                    icon="plus"
                    onClick={() => setCreating(true)}
                  >
                    New batch
                  </Button>
                ) : undefined
              }
            >
              {query
                ? undefined
                : "A batch is one year’s intake for a programme, e.g. “23-27 BBA-IT”."}
            </EmptyState>
          </Card>
        )
      ) : (
        // One card with a hairline between intakes, not a card per intake:
        // fourteen stacked elevated boxes said "fourteen separate things",
        // where this is one list whose entries happen to have children.
        <Card pad={0} className="overflow-hidden">
          {rows.map((batch, i) => (
            <section
              key={batch.id}
              aria-label={batch.name}
              className={`flex flex-col gap-3 px-4 py-4 sm:px-5 ${
                i > 0 ? "shadow-[inset_0_1px_0_var(--hair-soft)]" : ""
              }`}
            >
              {/* Two columns, so the gear has a corner of its own: on one
                  wrapping line it landed beside the badge on some intakes and
                  alone on a second line on others, depending on the name. */}
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-title text-md font-semibold tracking-[-0.01em]">
                    {batch.name}
                  </h3>
                  {/* The name already says the programme and the years in
                      short; this line says them in full, once, beside the
                      headcount, instead of three badges restating the name. */}
                  <p className="text-muted mt-0.5 text-xs">
                    {batch.courseCode}, {batch.startYear}-{batch.endYear},{" "}
                    <span className="font-mono tabular-nums">
                      {batch.studentCount}
                    </span>{" "}
                    {batch.studentCount === 1 ? "student" : "students"}
                  </p>
                </div>
                {canManage && (
                  <IconButton
                    icon="settings"
                    label={`Edit ${batch.name}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(batch.id)}
                  />
                )}
              </div>

              {batch.groups.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {batch.groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => onOpenGroup(group.id)}
                      className="plr-clip bg-surface hover:bg-surface-hover flex min-h-10 max-w-full cursor-pointer items-center gap-2 rounded-[10px] py-1.5 pr-3 pl-1.5 text-left shadow-[inset_0_0_0_1px_var(--card-ring)] hover:shadow-[inset_0_0_0_1px_var(--field-line-hover)] active:scale-[0.97] lg:min-h-9"
                    >
                      <Badge tone={KIND_TONE[group.kind]}>
                        {KIND_LABEL[group.kind]}
                      </Badge>
                      <span className="text-title min-w-0 truncate text-sm font-semibold">
                        {group.label}
                      </span>
                      <span className="text-faint shrink-0 font-mono text-xs tabular-nums">
                        {group.studentCount}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-sm">
                  Nothing under this batch yet. Add a group and file it here.
                </p>
              )}
            </section>
          ))}
        </Card>
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
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
          >
            {saving ? "Saving…" : batch ? "Save changes" : "Create batch"}
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

        <Field label="Programme">
          {(id) => (
            <SearchSelect
              id={id}
              value={
                selectedProgramme ? programmeCard(selectedProgramme) : null
              }
              onChange={(id) => setCourseId(id ?? "")}
              page={pickerPage(courses.data, (rows) => rows.map(programmeCard))}
              loading={courses.isLoading}
              query={programmeQuery}
              onQueryChange={setProgrammeQuery}
              onLoadMore={() => setCoursePageSize((n) => n + 20)}
              placeholder="Search programmes…"
              listId="batch-course"
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            {(id) => (
              <Input
                id={id}
                value={startYear}
                inputMode="numeric"
                onChange={(e) => setStartYear(e.target.value)}
                className="font-mono tabular-nums"
              />
            )}
          </Field>
          <Field label="Finishes">
            {(id) => (
              <Input
                id={id}
                value={endYear}
                inputMode="numeric"
                onChange={(e) => setEndYear(e.target.value)}
                className="font-mono tabular-nums"
              />
            )}
          </Field>
        </div>

        <Field label="Name">
          {(id) => (
            <>
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 23-27 BBA-IT"
              />
              {suggested && suggested !== name && (
                <Button
                  variant="quiet"
                  size="sm"
                  className="self-start"
                  onClick={() => setName(suggested)}
                >
                  Use “{suggested}”
                </Button>
              )}
            </>
          )}
        </Field>

        {batch && (
          <DeleteZone
            subject={batch.name}
            pending={remove.isPending}
            onDelete={() => remove.mutate({ id: batch.id })}
          >
            Deleting the batch leaves its groups in place; they simply stop
            belonging to an intake.
          </DeleteZone>
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
