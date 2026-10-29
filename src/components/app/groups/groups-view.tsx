"use client";

import { useEffect, useState } from "react";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Avatar } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
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
import { Pager } from "./pager";

type Tab = "groups" | "batches" | "programmes";

/**
 * What the toolbar's create button says on each tab. The button lives in the
 * toolbar for all three, rather than the two panels each drawing their own on
 * a row underneath, so switching tabs no longer moves it or shoves the list
 * down by a row.
 */
const CREATE_LABEL: Record<Tab, string> = {
  groups: "New group",
  batches: "New batch",
  programmes: "New programme",
};

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
  // Which tab's create dialog is open, if any. The panels own their dialogs;
  // this only says when to show them.
  const [creating, setCreating] = useState<Tab | null>(null);
  const [tab, setTab] = useState<Tab>("groups");

  const utils = api.useUtils();
  const debounced = useDebounced(query);
  useEffect(() => setPage(1), [debounced, programmeId]);

  const groups = api.groups.list.useQuery(
    { query: debounced || undefined, programmeId, page, pageSize: 24 },
    { placeholderData: (prev) => prev },
  );
  const lastPage = groups.data?.pageCount ?? 1;
  // Deleting the last group on the final page leaves the page number past the
  // end, which shows an empty list with no pager. Placeholder data still
  // carries the previous page count, so wait for the real answer.
  useEffect(() => {
    if (
      groups.data &&
      !groups.isPlaceholderData &&
      page > groups.data.pageCount
    ) {
      setPage(Math.max(1, groups.data.pageCount));
    }
  }, [groups.data, groups.isPlaceholderData, page]);
  // The programme filter is itself a list, so it is paged and searchable too.
  const [programmeQuery, setProgrammeQuery] = useState("");
  const [programmePageSize, setProgrammePageSize] = useState(20);
  const courses = api.groups.programmeList.useQuery(
    {
      query: useDebounced(programmeQuery) || undefined,
      pageSize: programmePageSize,
      // Without this the chosen programme drops out of the rows on a narrowing
      // search and its label falls back to a placeholder.
      includeIds: programmeId ? [programmeId] : undefined,
    },
    // Every change of key (a choice, a search, a longer page) would otherwise
    // leave `data` empty until the answer arrives: the trigger would read "All
    // programmes" with the list already filtered, and the open list would blank.
    { placeholderData: (prev) => prev },
  );
  const selectedProgramme = courses.data?.rows.find(
    (c) => c.id === programmeId,
  );

  const canCreate = tab === "programmes" ? canManageProgrammes : canManage;
  const rows = groups.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="Groups"
        subtitle="The three ways students are divided: programmes, the intakes admitted to them, and the groups those split into"
      />
      <PageBody>
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
              ariaLabel="Show"
            />
          </div>
          <Input
            icon="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tab}…`}
            // The placeholder says what the box is for while it is empty and
            // nothing once it is not, so the name is said separately.
            aria-label={`Search ${tab}`}
            className="w-full sm:w-64"
          />
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
                onLoadMore={() => setProgrammePageSize((n) => n + 20)}
                // "Programme", as the tab beside it says: on this screen a
                // course used to mean a degree here and a subject one click
                // away on /courses, which is two levels of the hierarchy under
                // one word.
                placeholder="Search programmes…"
                emptyOption="All programmes"
                listId="course-filter"
              />
            </div>
          )}
          {/* The tally and the create button keep the right-hand end on every
              tab; on a phone they share the last line, right-aligned. */}
          <div className="ml-auto flex items-center gap-3">
            {tab === "groups" && (
              <span className="text-faint font-mono text-xs tabular-nums">
                {groups.data?.total ?? 0} groups
              </span>
            )}
            {canCreate && (
              <Button
                variant="primary"
                icon="plus"
                onClick={() => setCreating(tab)}
              >
                {CREATE_LABEL[tab]}
              </Button>
            )}
          </div>
        </div>

        {tab === "batches" ? (
          <BatchesPanel
            query={debounced}
            canManage={canManage}
            onOpenGroup={setOpenId}
            creating={creating === "batches"}
            onCreatingChange={(open) => setCreating(open ? "batches" : null)}
          />
        ) : tab === "programmes" ? (
          <ProgrammesPanel
            query={debounced}
            canManage={canManageProgrammes}
            creating={creating === "programmes"}
            onCreatingChange={(open) => setCreating(open ? "programmes" : null)}
          />
        ) : (
          <>
            {rows.length > 0 ? (
              // One list rather than a wall of cards: a coordinator comes here
              // to find one group among thirty-odd, and a column of rows lines
              // the names up down one edge and the numbers down another, where
              // a grid of identical cards made the eye hunt across and down.
              // The whole row opens the group, so the way in is the size of
              // the thing rather than a small "Manage" at one corner of it.
              <Card pad={0} className="overflow-hidden">
                <ul aria-label="Groups">
                  {rows.map((g, i) => (
                    <li
                      key={g.id}
                      className={
                        i > 0 ? "shadow-[inset_0_1px_0_var(--hair-soft)]" : ""
                      }
                    >
                      <GroupRow group={g} onOpen={() => setOpenId(g.id)} />
                    </li>
                  ))}
                </ul>
              </Card>
            ) : groups.isLoading ? (
              <ListSkeleton label="Loading groups" />
            ) : (
              <Card>
                <EmptyState
                  icon="layers"
                  title={
                    debounced || programmeId
                      ? "No groups match that search"
                      : "No groups yet"
                  }
                  action={
                    canManage && !debounced && !programmeId ? (
                      <Button
                        variant="primary"
                        icon="plus"
                        onClick={() => setCreating("groups")}
                      >
                        New group
                      </Button>
                    ) : undefined
                  }
                />
              </Card>
            )}

            <Pager
              page={page}
              lastPage={lastPage}
              onPrevious={() => setPage((n) => n - 1)}
              onNext={() => setPage((n) => n + 1)}
            />
          </>
        )}
      </PageBody>

      {openId && (
        <GroupDetailDialog
          groupId={openId}
          canManage={canManage}
          canMarkAttendance={canMarkAttendance}
          onClose={() => setOpenId(null)}
        />
      )}
      {creating === "groups" && (
        <NewGroupDialog
          onClose={() => setCreating(null)}
          onCreated={() => utils.groups.invalidate()}
        />
      )}
    </>
  );
}

interface GroupRowData {
  id: string;
  label: string;
  batchName: string | null;
  courseCode: string;
  kind: GroupKindName;
  studentCount: number;
  eventCount: number;
  faculty: { id: string; name: string }[];
}

/**
 * One group, as a row that opens it.
 *
 * Stacked on a phone (the name and its batch, who teaches it, then its kind
 * and what it adds up to) and flattened from sm into fixed columns, so the
 * counts line up down the list the way the course catalogue's do. The
 * programme code that used to sit in a badge beside the name is gone: the
 * batch line already says it ("26-30 BBA-IT"), and only a group with no batch
 * needs it spelt out.
 */
function GroupRow({
  group: g,
  onOpen,
}: {
  group: GroupRowData;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      // The focus outline is drawn inside the row: the card clips at its
      // rounded corners, and an outline outside the row would be cut off by
      // it at the first and last rows and hidden under the neighbours between.
      className="plr-clip plr-slotcol flex w-full cursor-pointer flex-col gap-2 px-4 py-3 text-left focus-visible:-outline-offset-2 sm:flex-row sm:items-center sm:gap-4 sm:py-2.5"
    >
      <span className="flex min-w-0 items-start gap-3 sm:flex-1">
        <span className="min-w-0 flex-1">
          <span className="text-title block truncate text-base font-semibold">
            {g.label}
          </span>
          <span className="text-muted block truncate text-xs">
            {g.batchName ?? `${g.courseCode}, no batch`}
          </span>
          {/* Below xl there is no room for a teachers column beside the
              counts, so who teaches the group goes under its name. */}
          <span className="mt-1.5 flex xl:hidden">
            <Teachers faculty={g.faculty} />
          </span>
        </span>
        {/* The arrow belongs at the end of the line the name is on, which is a
            different line in each layout, so it is drawn twice rather than
            moved: it is decoration either way. */}
        <Icon
          name="chevronRight"
          size={14}
          color="var(--faint)"
          className="mt-1 sm:hidden"
        />
      </span>

      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0 sm:flex-nowrap sm:gap-4">
        <span className="shrink-0 sm:w-[84px]">
          <Badge tone={KIND_TONE[g.kind]}>{KIND_LABEL[g.kind]}</Badge>
        </span>
        <span className="hidden w-[220px] min-w-0 xl:flex">
          <Teachers faculty={g.faculty} />
        </span>
        <span className="text-muted shrink-0 font-mono text-xs tabular-nums sm:w-[96px] sm:text-right">
          {g.studentCount} {g.studentCount === 1 ? "student" : "students"}
        </span>
        <span
          className={`shrink-0 font-mono text-xs tabular-nums sm:w-[88px] sm:text-right ${
            g.eventCount > 0 ? "text-muted" : "text-faint"
          }`}
        >
          {g.eventCount} {g.eventCount === 1 ? "lecture" : "lectures"}
        </span>
      </span>

      <Icon
        name="chevronRight"
        size={14}
        color="var(--faint)"
        className="hidden sm:block"
      />
    </button>
  );
}

/** Who teaches a group: their tiles, then their names, truncated as one line. */
function Teachers({ faculty }: { faculty: { id: string; name: string }[] }) {
  if (faculty.length === 0) {
    return <span className="text-faint text-xs">No faculty assigned</span>;
  }
  const names = faculty.map((f) => f.name).join(", ");
  return (
    <span className="flex min-w-0 items-center gap-2" title={names}>
      <span className="flex shrink-0 gap-1">
        {faculty.slice(0, 3).map((f) => (
          <Avatar key={f.id} name={f.name} size={20} />
        ))}
      </span>
      <span className="text-muted min-w-0 truncate text-xs">{names}</span>
    </span>
  );
}

/** Rows the shape of the list that is coming, while its first page loads. */
function ListSkeleton({ label }: { label: string }) {
  return (
    <Card pad={0} className="overflow-hidden">
      <div role="status" aria-label={label}>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-4 py-3.5 ${
              i > 0 ? "shadow-[inset_0_1px_0_var(--hair-soft)]" : ""
            }`}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </span>
            <Skeleton className="hidden h-5 w-16 sm:block" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </Card>
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

  // Placeholder data keeps the list and the chosen label on screen while a
  // longer page loads, rather than blanking them for the round trip.
  const courses = api.groups.programmeList.useQuery(
    {
      query: useDebounced(programmeQuery) || undefined,
      pageSize: coursePageSize,
      includeIds: programmeId ? [programmeId] : undefined,
    },
    { placeholderData: (prev) => prev },
  );
  const terms = api.groups.termList.useQuery(
    {
      query: useDebounced(termQuery) || undefined,
      pageSize: termPageSize,
      includeIds: semesterId ? [semesterId] : undefined,
    },
    { placeholderData: (prev) => prev },
  );
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
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
          >
            Create group
          </Button>
        </>
      }
    >
      {/* The fields run in the order the hierarchy does everywhere else in
          the app (programme, then its intake, then the semester), and only
          then what this group is: its kind and its names. */}
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
              placeholder="Search programmes…"
              listId="new-group-course"
            />
          )}
        </Field>
        {/* Both of these are popovers that need room for a hint line, so on a
            phone they take a row each rather than halving a 294px dialog. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
          <Field label="Batch">
            {(id) => (
              <Select
                id={id}
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
                    hint: `${b.startYear}-${b.endYear} · ${b.courseCode}`,
                  })),
                ]}
                onChange={setBatchId}
              />
            )}
          </Field>
          {/* "Semester", the app's own word for it everywhere else; this was
              the one place that called it a term. */}
          <Field label="Semester">
            {(id) => (
              <SearchSelect
                id={id}
                value={selectedTerm ? semesterCard(selectedTerm) : null}
                onChange={(id) => setTermId(id ?? "")}
                page={pickerPage(terms.data, (rows) => rows.map(semesterCard))}
                loading={terms.isLoading}
                query={termQuery}
                onQueryChange={setTermQuery}
                onLoadMore={() => setTermPageSize((n) => n + 20)}
                placeholder="Search semesters…"
                emptyOption="No semester"
                listId="new-group-term"
              />
            )}
          </Field>
        </div>

        <Field label="Kind">
          {(id) => (
            <Select
              id={id}
              value={kind}
              options={GROUP_KINDS.map((k) => ({
                value: k,
                label: KIND_LABEL[k],
                hint: KIND_HINT[k],
              }))}
              onChange={setKind}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
          <Field label="Group name">
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. BCA-C"
              />
            )}
          </Field>
          <Field label="Display label" optional>
            {(id) => (
              <Input
                id={id}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. BCA-C · Sem III"
              />
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
