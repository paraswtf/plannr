"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { SearchSelect, useDebounced } from "~/components/ui/entity-picker";
import { Icon } from "~/components/ui/icon";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api } from "~/trpc/react";
import { GroupDetailDialog } from "./group-detail-dialog";

/** How a course appears in a search result. */
const courseCard = (c: {
  id: string;
  code: string;
  name: string;
  groupCount: number;
}) => ({
  id: c.id,
  label: c.code,
  card: {
    label: c.code,
    avatar: {
      kind: "initials" as const,
      text: c.code.slice(0, 2).toUpperCase(),
    },
    title: c.code,
    subtitle: c.name,
    badges: [
      {
        text: `${c.groupCount} ${c.groupCount === 1 ? "group" : "groups"}`,
        tone: "slate" as const,
      },
    ],
  },
});

const termCard = (t: {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
}) => {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", {
      month: "short",
      year: "numeric",
    }).format(d);
  return {
    id: t.id,
    label: t.name,
    card: {
      label: t.name,
      avatar: { kind: "icon" as const, name: "calendar" as const },
      title: t.name,
      subtitle: `${fmt(t.startDate)} – ${fmt(t.endDate)}`,
      badges: t.isCurrent
        ? [{ text: "current", tone: "green" as const, dot: true }]
        : [],
    },
  };
};

export function GroupsView({ permissions }: { permissions: string }) {
  const canManage = new PermissionBitField(BigInt(permissions)).has(
    PermissionFlags.ManageGroups,
  );

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [courseId, setCourseId] = useState<string | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const utils = api.useUtils();
  const debounced = useDebounced(query);
  useEffect(() => setPage(1), [debounced, courseId]);

  const groups = api.groups.list.useQuery(
    { query: debounced || undefined, courseId, page, pageSize: 24 },
    { placeholderData: (prev) => prev },
  );
  // The course filter is itself a list, so it is paged and searchable too.
  const [courseQuery, setCourseQuery] = useState("");
  const courses = api.groups.courseList.useQuery({
    query: useDebounced(courseQuery) || undefined,
    pageSize: 20,
    // Without this the chosen course drops out of the rows on a narrowing
    // search and its label falls back to a placeholder.
    includeIds: courseId ? [courseId] : undefined,
  });
  const selectedCourse = courses.data?.rows.find((c) => c.id === courseId);

  return (
    <>
      <PageHeader
        title="Groups"
        subtitle="Class cohorts, their students and who teaches them"
      />
      <div className="px-9 pt-2 pb-10">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
              <Icon name="search" size={15} color="var(--faint)" />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search groups…"
              className="bg-surface w-full rounded-[10px] py-2 pr-3 pl-9 text-[13.5px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
          </div>
          <div className="w-56">
            <SearchSelect
              value={selectedCourse ? courseCard(selectedCourse) : null}
              onChange={(id) => setCourseId(id ?? undefined)}
              page={
                courses.data && {
                  ...courses.data,
                  rows: courses.data.rows.map(courseCard),
                }
              }
              loading={courses.isLoading}
              query={courseQuery}
              onQueryChange={setCourseQuery}
              placeholder="Search courses…"
              emptyOption="All courses"
              listId="course-filter"
            />
          </div>
          <span className="text-faint ml-auto font-mono text-[12px]">
            {groups.data?.total ?? 0} groups
          </span>
          {canManage && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white"
              style={{ background: "var(--grad-brand)" }}
            >
              + New group
            </button>
          )}
        </div>

        <div className="grid [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {(groups.data?.rows ?? []).map((g) => (
            <Card key={g.id} pad={18} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-display text-title text-[16px] font-bold">
                  {g.label}
                </span>
                <Badge tone="orange">{g.courseCode}</Badge>
              </div>

              <div>
                <div className="text-muted mb-1.5 text-[12.5px]">Taught by</div>
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
                  className="text-slate cursor-pointer text-[13px] font-bold"
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
              {groups.isLoading ? "Loading…" : "No groups match that search."}
            </p>
          </Card>
        )}

        {(groups.data?.pageCount ?? 1) > 1 && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((n) => n - 1)}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
              style={{
                boxShadow: "var(--ring)",
                opacity: page === 1 ? 0.4 : 1,
              }}
            >
              Previous
            </button>
            <span className="text-faint font-mono text-[12px]">
              page {page} of {groups.data?.pageCount}
            </span>
            <button
              type="button"
              disabled={!groups.data?.hasMore}
              onClick={() => setPage((n) => n + 1)}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
              style={{
                boxShadow: "var(--ring)",
                opacity: groups.data?.hasMore ? 1 : 0.4,
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {openId && (
        <GroupDetailDialog
          groupId={openId}
          canManage={canManage}
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
  const [courseQuery, setCourseQuery] = useState("");
  const [coursePageSize, setCoursePageSize] = useState(20);
  const [termQuery, setTermQuery] = useState("");
  const [termPageSize, setTermPageSize] = useState(20);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [courseId, setCourseId] = useState("");
  const [termId, setTermId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const courses = api.groups.courseList.useQuery({
    query: useDebounced(courseQuery) || undefined,
    pageSize: coursePageSize,
    includeIds: courseId ? [courseId] : undefined,
  });
  const terms = api.groups.termList.useQuery({
    query: useDebounced(termQuery) || undefined,
    pageSize: termPageSize,
    includeIds: termId ? [termId] : undefined,
  });
  const selectedCourse = courses.data?.rows.find((c) => c.id === courseId);
  const selectedTerm = terms.data?.rows.find((t) => t.id === termId);

  const create = api.groups.create.useMutation({
    onSuccess: async () => {
      await onCreated();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const ready = name.trim() && courseId;

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
            className="text-muted cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-semibold"
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
                courseId,
                termId: termId || undefined,
              })
            }
            className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white"
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
            value={selectedCourse ? courseCard(selectedCourse) : null}
            onChange={(id) => setCourseId(id ?? "")}
            page={
              courses.data && {
                ...courses.data,
                rows: courses.data.rows.map(courseCard),
              }
            }
            loading={courses.isLoading}
            query={courseQuery}
            onQueryChange={setCourseQuery}
            onLoadMore={() => setCoursePageSize((n) => n + 20)}
            placeholder="Search courses…"
            listId="new-group-course"
          />
        </Labelled>
        <Labelled label="Group name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BCA-C"
            className="bg-surface w-full rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Labelled>
        <Labelled label="Display label">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. BCA-C · Sem III"
            className="bg-surface w-full rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Labelled>
        <Labelled label="Term">
          <SearchSelect
            value={selectedTerm ? termCard(selectedTerm) : null}
            onChange={(id) => setTermId(id ?? "")}
            page={
              terms.data && {
                ...terms.data,
                rows: terms.data.rows.map(termCard),
              }
            }
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
