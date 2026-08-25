"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import {
  pickerPage,
  SearchSelect,
  useDebounced,
} from "~/components/ui/entity-picker";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api } from "~/trpc/react";
import { BatchesPanel } from "./batches-panel";
import { ProgrammesPanel } from "./programmes-panel";
import { programmeCard, semesterCard } from "./entity-cards";
import { GroupDetailDialog } from "./group-detail-dialog";
import {
  GROUP_KINDS,
  KIND_HINT,
  KIND_LABEL,
  KIND_TONE,
  type GroupKindName,
} from "./group-vocab";

export function GroupsView({ permissions }: { permissions: string }) {
  const bits = new PermissionBitField(BigInt(permissions));
  const canManage = bits.has(PermissionFlags.ManageGroups);
  // Programmes sit above groups in the hierarchy and carry their own permission,
  // so someone may reorganise divisions without being able to add a programme.
  const canManageProgrammes = bits.has(PermissionFlags.ManageProgrammes);
  const canMarkAttendance = bits.has(PermissionFlags.MarkAttendance);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [programmeId, setCourseId] = useState<string | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"groups" | "batches" | "programmes">("groups");

  const utils = api.useUtils();
  const debounced = useDebounced(query);
  useEffect(() => setPage(1), [debounced, programmeId]);

  const groups = api.groups.list.useQuery(
    { query: debounced || undefined, programmeId, page, pageSize: 24 },
    { placeholderData: (prev) => prev },
  );
  const lastPage = groups.data?.pageCount ?? 1;
  // The programme filter is itself a list, so it is paged and searchable too.
  const [programmeQuery, setProgrammeQuery] = useState("");
  const courses = api.groups.programmeList.useQuery({
    query: useDebounced(programmeQuery) || undefined,
    pageSize: 20,
    // Without this the chosen programme drops out of the rows on a narrowing
    // search and its label falls back to a placeholder.
    includeIds: programmeId ? [programmeId] : undefined,
  });
  const selectedProgramme = courses.data?.rows.find(
    (c) => c.id === programmeId,
  );

  return (
    <>
      <PageHeader
        title="Groups"
        subtitle="The three ways students are divided: programmes, the intakes admitted to them, and the groups those split into"
      />
      <div className="px-4 pt-2 pb-8 sm:px-6 lg:px-9 lg:pb-10">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {/* Three tabs just overrun a 390px screen. The strip scrolls inside
              itself, so all it wants here is a line of its own; a second
              scroll box around it would clip the active pill's shadow. */}
          <div className="w-full sm:w-auto">
            <Segmented
              items={[
                { value: "groups" as const, label: "Groups" },
                { value: "batches" as const, label: "Batches" },
                { value: "programmes" as const, label: "Programmes" },
              ]}
              value={tab}
              onChange={setTab}
              size="sm"
            />
          </div>
          <div className="relative w-full sm:w-64">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
              <Icon name="search" size={15} color="var(--faint)" />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${tab}…`}
              // 16px on a phone: below that, Safari zooms the page in as the
              // field takes focus, and a zoomed page is one that scrolls
              // sideways.
              className="bg-surface min-h-10 w-full rounded-[10px] py-2 pr-3 pl-9 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
              style={{ boxShadow: "var(--ring)" }}
            />
          </div>
          {tab === "groups" && (
            <div className="w-full sm:w-56">
              <SearchSelect
                value={
                  selectedProgramme ? programmeCard(selectedProgramme) : null
                }
                onChange={(id) => setCourseId(id ?? undefined)}
                page={pickerPage(courses.data, (rows) =>
                  rows.map(programmeCard),
                )}
                loading={courses.isLoading}
                query={programmeQuery}
                onQueryChange={setProgrammeQuery}
                placeholder="Search courses…"
                emptyOption="All courses"
                listId="course-filter"
              />
            </div>
          )}
          {tab === "groups" && (
            <span className="text-faint ml-auto font-mono text-[12px]">
              {groups.data?.total ?? 0} groups
            </span>
          )}
          {canManage && tab === "groups" && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="min-h-10 cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
              style={{ background: "var(--grad-brand)" }}
            >
              + New group
            </button>
          )}
        </div>

        {tab === "batches" ? (
          <BatchesPanel
            query={debounced}
            canManage={canManage}
            onOpenGroup={setOpenId}
          />
        ) : tab === "programmes" ? (
          <ProgrammesPanel query={debounced} canManage={canManageProgrammes} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
              {(groups.data?.rows ?? []).map((g) => (
                <Card key={g.id} pad={18} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-display text-title block text-[16px] font-bold">
                        {g.label}
                      </span>
                      <span className="text-faint block text-[12px]">
                        {g.batchName ?? "No batch"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone="orange">{g.courseCode}</Badge>
                      <Badge tone={KIND_TONE[g.kind]}>
                        {KIND_LABEL[g.kind]}
                      </Badge>
                    </span>
                  </div>

                  <div>
                    <div className="text-muted mb-1.5 text-[12.5px]">
                      Taught by
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {g.faculty.length > 0 ? (
                        g.faculty.map((f: { id: string; name: string }) => (
                          <span
                            key={f.id}
                            className="text-muted inline-flex items-center gap-1.5 text-[12.5px]"
                          >
                            <span
                              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ background: "var(--slate)" }}
                            >
                              {f.name
                                .replace(/^(Dr|Prof|Ms|Mr)\.?\s*/, "")
                                .charAt(0)}
                            </span>
                            {f.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-faint text-[12.5px]">
                          No faculty assigned
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="flex items-center gap-2">
                      <Badge tone="green" dot>
                        {g.studentCount} students
                      </Badge>
                      {g.eventCount > 0 && (
                        <span className="text-faint font-mono text-[11.5px]">
                          {g.eventCount} classes
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenId(g.id)}
                      className="text-slate inline-flex min-h-10 cursor-pointer items-center text-[13px] font-bold lg:min-h-0"
                    >
                      Manage →
                    </button>
                  </div>
                </Card>
              ))}
            </div>

            {(groups.data?.rows ?? []).length === 0 && (
              <Card>
                <p className="text-muted m-0 text-[14px]">
                  {groups.isLoading
                    ? "Loading…"
                    : "No groups match that search."}
                </p>
              </Card>
            )}

            {lastPage > 1 && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((n) => n - 1)}
                  className="min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold lg:min-h-0"
                  style={{
                    boxShadow: "var(--ring)",
                    opacity: page === 1 ? 0.4 : 1,
                  }}
                >
                  Previous
                </button>
                <span className="text-faint font-mono text-[12px]">
                  page {page} of {lastPage}
                </span>
                <button
                  type="button"
                  disabled={page >= lastPage}
                  onClick={() => setPage((n) => n + 1)}
                  className="min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold lg:min-h-0"
                  style={{
                    boxShadow: "var(--ring)",
                    opacity: page < lastPage ? 1 : 0.4,
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {openId && (
        <GroupDetailDialog
          groupId={openId}
          canManage={canManage}
          canMarkAttendance={canMarkAttendance}
          onClose={() => setOpenId(null)}
        />
      )}
      {creating && (
        <NewGroupDialog
          onClose={() => setCreating(false)}
          onCreated={() => utils.groups.invalidate()}
        />
      )}
    </>
  );
}

function NewGroupDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<unknown>;
}) {
  // Both of these were native selects fed by an unargumented query, so only
  // the first 20 rows ever appeared — and course is required to create a
  // group, which made anything past #20 unpickable.
  const [programmeQuery, setProgrammeQuery] = useState("");
  const [coursePageSize, setCoursePageSize] = useState(20);
  const [termQuery, setTermQuery] = useState("");
  const [termPageSize, setTermPageSize] = useState(20);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [programmeId, setCourseId] = useState("");
  const [semesterId, setTermId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [kind, setKind] = useState<GroupKindName>("DIVISION");
  const [error, setError] = useState<string | null>(null);

  // Batches are few, so the whole list comes down and narrows to the course
  // once one is chosen — a group belongs to an intake of its own course.
  const batches = api.groups.batchList.useQuery({
    programmeId: programmeId || undefined,
  });

  const courses = api.groups.programmeList.useQuery({
    query: useDebounced(programmeQuery) || undefined,
    pageSize: coursePageSize,
    includeIds: programmeId ? [programmeId] : undefined,
  });
  const terms = api.groups.termList.useQuery({
    query: useDebounced(termQuery) || undefined,
    pageSize: termPageSize,
    includeIds: semesterId ? [semesterId] : undefined,
  });
  const selectedProgramme = courses.data?.rows.find(
    (c) => c.id === programmeId,
  );
  const selectedTerm = terms.data?.rows.find((t) => t.id === semesterId);

  const create = api.groups.create.useMutation({
    onSuccess: async () => {
      await onCreated();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const ready = name.trim() && programmeId;

  return (
    <Dialog
      open
      title="New group"
      icon="layers"
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
            disabled={!ready || create.isPending}
            onClick={() =>
              create.mutate({
                name,
                label: label || undefined,
                programmeId,
                semesterId: semesterId || undefined,
                batchId: batchId || undefined,
                kind,
              })
            }
            className="min-h-10 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
            style={{
              background: "var(--grad-brand)",
              opacity: ready ? 1 : 0.5,
              cursor: ready ? "pointer" : "not-allowed",
            }}
          >
            Create group
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
        <Labelled label="Course">
          <SearchSelect
            value={selectedProgramme ? programmeCard(selectedProgramme) : null}
            onChange={(id) => {
              setCourseId(id ?? "");
              // Batches belong to a course, so the one chosen under the old
              // course is not merely unlisted now — it would be wrong.
              setBatchId("");
            }}
            page={pickerPage(courses.data, (rows) => rows.map(programmeCard))}
            loading={courses.isLoading}
            query={programmeQuery}
            onQueryChange={setProgrammeQuery}
            onLoadMore={() => setCoursePageSize((n) => n + 20)}
            placeholder="Search courses…"
            listId="new-group-course"
          />
        </Labelled>
        {/* Both of these are popovers that need room for a hint line, so on a
            phone they take a row each rather than halving a 294px dialog. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Batch">
            <Select
              ariaLabel="Batch"
              value={batchId}
              placeholder="No batch"
              options={[
                {
                  value: "",
                  label: "No batch",
                  hint: "e.g. a shared elective",
                },
                ...(batches.data?.rows ?? []).map((b) => ({
                  value: b.id,
                  label: b.name,
                  hint: `${b.startYear}–${b.endYear} · ${b.courseCode}`,
                })),
              ]}
              onChange={setBatchId}
            />
          </Labelled>
          <Labelled label="Kind">
            <Select
              ariaLabel="Kind"
              value={kind}
              options={GROUP_KINDS.map((k) => ({
                value: k,
                label: KIND_LABEL[k],
                hint: KIND_HINT[k],
              }))}
              onChange={setKind}
            />
          </Labelled>
        </div>

        <Labelled label="Group name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BCA-C"
            // 16px on a phone: below that, Safari zooms the page in as the
            // field takes focus, which on a dialog leaves it half off screen.
            className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Labelled>
        <Labelled label="Display label">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. BCA-C · Sem III"
            className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Labelled>
        <Labelled label="Term">
          <SearchSelect
            value={selectedTerm ? semesterCard(selectedTerm) : null}
            onChange={(id) => setTermId(id ?? "")}
            page={pickerPage(terms.data, (rows) => rows.map(semesterCard))}
            loading={terms.isLoading}
            query={termQuery}
            onQueryChange={setTermQuery}
            onLoadMore={() => setTermPageSize((n) => n + 20)}
            placeholder="Search terms…"
            emptyOption="No term"
            listId="new-group-term"
          />
        </Labelled>
      </div>
    </Dialog>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      {children}
    </label>
  );
}
