"use client";

import { useEffect, useRef, useState } from "react";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { SearchSelect, useDebounced } from "~/components/ui/entity-picker";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { roleCard } from "./entity-cards";
import { personName } from "~/lib/people";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api } from "~/trpc/react";
import { AddPersonDialog } from "./add-person-dialog";
import { ImportDialog } from "./import-dialog";
import { PersonAddress } from "./person-address";
import { RoleManager } from "./role-manager";
import { UserDetailDialog } from "./user-detail-dialog";

const STATUSES = [
  { value: "all" as const, label: "All" },
  { value: "active" as const, label: "Active" },
  { value: "never-signed-in" as const, label: "Not signed in" },
  { value: "inactive" as const, label: "Disabled" },
];

const PAGE_SIZES = [10, 25, 50, 100];

export function PeopleView({ permissions }: { permissions: string }) {
  const bits = new PermissionBitField(BigInt(permissions));
  const canManage = bits.has(PermissionFlags.ManageUsers);
  const canManageRoles = bits.has(PermissionFlags.ManageRoles);
  const canImport = bits.has(PermissionFlags.ImportUsers);

  const [tab, setTab] = useState<"people" | "roles">("people");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [roleId, setRoleId] = useState<string | undefined>();
  const [status, setStatus] =
    useState<(typeof STATUSES)[number]["value"]>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const utils = api.useUtils();
  const [roleQuery, setRoleQuery] = useState("");
  const roles = api.roles.list.useQuery();
  const debouncedRole = useDebounced(roleQuery);
  // Roles are user-creatable, so this list grows; it is filtered client-side
  // because the whole set is small and already loaded for the cards.
  const roleRows = (roles.data?.rows ?? []).filter((r) =>
    debouncedRole
      ? r.name.toLowerCase().includes(debouncedRole.toLowerCase())
      : true,
  );
  const selectedRole = (roles.data?.rows ?? []).find((r) => r.id === roleId);

  // Debounced so the list query does not fire on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const filters = { query: debounced || undefined, roleId, status };
  const list = api.users.list.useQuery(
    { ...filters, page, pageSize },
    { placeholderData: (prev) => prev },
  );
  // The count of what the *typed* query would return, before it is applied.
  const preview = api.users.count.useQuery(
    { ...filters, query: query || undefined },
    { enabled: query !== debounced },
  );

  const bulkDelete = api.users.bulkDelete.useMutation({
    onSuccess: async (result) => {
      await utils.users.invalidate();
      setSelected(new Set());
      if (result.skipped.length > 0) {
        setNotice(
          `Removed ${result.deleted}. Skipped ${result.skipped.length}: ${result.skipped[0]!.reason}`,
        );
      } else {
        setNotice(
          `Removed ${result.deleted} ${result.deleted === 1 ? "person" : "people"}.`,
        );
      }
    },
  });
  const [notice, setNotice] = useState<string | null>(null);

  const rows = list.data?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const listTop = useRef<HTMLDivElement>(null);

  /**
   * Turn the page and put the reader at the top of the new one.
   *
   * A hundred people are a hundred stacked cards on a phone — five or six
   * screens — and the pager is underneath them, so paging without this leaves
   * the reader parked at the *last* row of the page they just asked for,
   * reading upwards. It only ever pulls the page up: someone who can see the
   * first row already (any desktop list that fits) is not moved at all.
   */
  const goToPage = (next: number) => {
    setPage(next);
    const anchor = listTop.current;
    if (anchor && anchor.getBoundingClientRect().top < 0) {
      anchor.scrollIntoView({ block: "start" });
    }
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Everyone on the system, and what they can do"
      />
      <div className="px-4 pt-2 pb-8 sm:px-6 lg:px-9 lg:pb-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            items={[
              { value: "people" as const, label: "People" },
              { value: "roles" as const, label: "Roles" },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === "people" && (
            <div className="flex flex-wrap items-center gap-2.5">
              {canImport && (
                <button
                  type="button"
                  onClick={() => setImporting(true)}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
                  style={{ boxShadow: "var(--ring)" }}
                >
                  <Icon name="upload" size={15} color="var(--slate)" />
                  Import CSV
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  // Buttons in this app are drawn at 34px, which is under the
                  // thumb-sized minimum; the floor is lifted only where a
                  // pointer is not the assumed input, so desktop is untouched.
                  className="min-h-10 cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
                  style={{ background: "var(--grad-brand)" }}
                >
                  + Add person
                </button>
              )}
            </div>
          )}
        </div>

        {tab === "roles" ? (
          <RoleManager canManage={canManageRoles} />
        ) : (
          <>
            {notice && (
              <div
                className="mb-4 flex items-center justify-between gap-3 rounded-xl p-3.5 text-[13px]"
                style={{
                  background: "rgba(68,88,121,0.07)",
                  boxShadow: "inset 0 0 0 1px var(--card-ring)",
                }}
              >
                <span className="text-ink">{notice}</span>
                <button
                  onClick={() => setNotice(null)}
                  aria-label="Dismiss"
                  className="-my-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:my-0 lg:h-6 lg:w-6"
                >
                  <Icon name="x" size={14} color="var(--muted)" />
                </button>
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
                  <Icon name="search" size={15} color="var(--faint)" />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email or PRN…"
                  // 16px on a phone: below that, Safari zooms the page in as
                  // the field takes focus, and a zoomed page is one that
                  // scrolls sideways.
                  className="bg-surface min-h-10 w-full rounded-[10px] py-2 pr-3 pl-9 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
                  style={{ boxShadow: "var(--ring)" }}
                />
              </div>
              {query !== debounced && preview.data !== undefined && (
                <span className="text-faint font-mono text-[12px]">
                  {preview.data} match{preview.data === 1 ? "" : "es"}
                </span>
              )}

              <div className="w-full sm:w-52">
                <SearchSelect
                  value={selectedRole ? roleCard(selectedRole) : null}
                  onChange={(id) => {
                    setRoleId(id ?? undefined);
                    setPage(1);
                  }}
                  page={{
                    rows: roleRows.map(roleCard),
                    total: roleRows.length,
                    hasMore: false,
                  }}
                  loading={roles.isLoading}
                  query={roleQuery}
                  onQueryChange={setRoleQuery}
                  placeholder="Search roles…"
                  emptyOption="All roles"
                  listId="role-filter"
                />
              </div>

              {/*
               * Four statuses are wider than a phone, and the strip already
               * scrolls inside itself, so all it wants here is a line of its
               * own; a second scroll box around it would clip the active
               * pill's shadow, which the strip's own padding exists to save.
               */}
              <div className="w-full sm:w-auto">
                <Segmented
                  items={STATUSES}
                  value={status}
                  onChange={(v) => {
                    setStatus(v);
                    setPage(1);
                  }}
                  size="sm"
                />
              </div>

              <div className="ml-auto flex items-center gap-3">
                <div className="text-faint flex items-center gap-2 text-[12px]">
                  Show
                  <Select
                    ariaLabel="Rows per page"
                    size="sm"
                    value={pageSize}
                    options={PAGE_SIZES.map((n) => ({
                      value: n,
                      label: String(n),
                    }))}
                    onChange={(n) => {
                      setPageSize(n);
                      setPage(1);
                    }}
                  />
                </div>
                <span className="text-faint font-mono text-[12px]">
                  {list.data?.total ?? 0} total
                </span>
              </div>
            </div>

            {canManage && selected.size > 0 && (
              <div
                className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl px-4 py-2.5"
                style={{
                  background: "rgba(68,88,121,0.08)",
                  boxShadow: "inset 0 0 0 1px var(--card-ring)",
                }}
              >
                <span className="text-[13px] font-semibold">
                  {selected.size} selected
                </span>
                <button
                  type="button"
                  disabled={bulkDelete.isPending}
                  onClick={() => bulkDelete.mutate({ ids: [...selected] })}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold text-white lg:min-h-0"
                  style={{ background: "var(--red)" }}
                >
                  <Icon name="trash" size={13} color="#fff" />
                  Remove selected
                </button>
              </div>
            )}

            {/*
             * Where the pager scrolls back to. The page header is sticky and
             * the phone's top bar is above it, so an unmargined anchor would
             * land the first row underneath both; the margin clears them and
             * collapses with `--topbar-h` once the sidebar is beside the page.
             */}
            <div
              ref={listTop}
              style={{ scrollMarginTop: "calc(var(--topbar-h) + 96px)" }}
            />

            {/*
             * Five columns of person, address, PRN, roles and status is a real
             * table on a desk and an unreadable ribbon on a phone: shrunk to
             * 390px the roles alone would wrap to four lines. Below md each row
             * is drawn as a stacked card instead of scrolling the table
             * sideways — every row here is one person's record rather than a
             * cell in a grid being compared across columns, so nothing is lost
             * by reading it top to bottom, and the whole row stays on screen
             * where a scrolling table would hide the status off the right edge.
             */}
            <Card pad={8} className="md:hidden">
              {canManage && rows.length > 0 && (
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="h-4.5 w-4.5"
                  />
                  <span className="text-muted text-[12px] font-bold tracking-wider uppercase">
                    Select all
                  </span>
                </label>
              )}
              {rows.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-1 px-1 py-1"
                  style={{ boxShadow: "inset 0 -1px 0 var(--hair-soft)" }}
                >
                  {canManage && (
                    <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                        aria-label={`Select ${personName(u, u.prn ?? "this person")}`}
                        className="h-4.5 w-4.5"
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenUserId(u.id)}
                    className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col gap-2 px-2 py-2 text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: "var(--slate)" }}
                      >
                        {personName(u, "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-title block truncate text-[13.5px] font-semibold">
                          {u.name ?? "—"}
                        </span>
                        <PersonAddress email={u.email} />
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {u.prn && (
                        <span className="text-muted font-mono text-[12px]">
                          {u.prn}
                        </span>
                      )}
                      <RoleBadges roles={u.roles} />
                      <StatusBadge user={u} />
                    </span>
                  </button>
                </div>
              ))}
              {rows.length === 0 && (
                <p className="text-muted m-0 px-2 py-7 text-center text-[13.5px]">
                  {list.isLoading
                    ? "Loading…"
                    : "Nobody matches those filters."}
                </p>
              )}
            </Card>

            <Card pad={8} className="hidden md:block">
              {/* Long role names can still outrun a tablet; the card scrolls. */}
              <div className="plr-scroll overflow-x-auto">
                <table className="w-full min-w-155 border-collapse">
                  <thead>
                    <tr>
                      {canManage && (
                        <Th style={{ width: 36 }}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAll}
                            aria-label="Select all"
                          />
                        </Th>
                      )}
                      <Th>Person</Th>
                      <Th>PRN</Th>
                      <Th>Roles</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => (
                      <tr
                        key={u.id}
                        className="cursor-pointer"
                        onClick={() => setOpenUserId(u.id)}
                      >
                        {canManage && (
                          <Td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(u.id)}
                              onChange={() => toggleOne(u.id)}
                              aria-label={`Select ${personName(u, u.prn ?? "this person")}`}
                            />
                          </Td>
                        )}
                        <Td>
                          <span className="flex items-center gap-2.5">
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                              style={{ background: "var(--slate)" }}
                            >
                              {personName(u, "?").charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="text-title block truncate font-semibold">
                                {u.name ?? "—"}
                              </span>
                              <PersonAddress email={u.email} />
                            </span>
                          </span>
                        </Td>
                        <Td>
                          <span className="text-muted font-mono text-[12.5px]">
                            {u.prn ?? "—"}
                          </span>
                        </Td>
                        <Td>
                          <span className="flex flex-wrap gap-1.5">
                            <RoleBadges roles={u.roles} />
                          </span>
                        </Td>
                        <Td>
                          <StatusBadge user={u} />
                        </Td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        {/*
                          Across every column, or the row is laid out inside the
                          first one — which is the 36px checkbox column whenever
                          the reader can manage users, so a centred message ends
                          up centred in 36px, well left of the table it belongs to.
                        */}
                        <Td
                          colSpan={canManage ? 5 : 4}
                          style={{ textAlign: "center", padding: "28px 0" }}
                        >
                          <span className="text-muted text-[13.5px]">
                            {list.isLoading
                              ? "Loading…"
                              : "Nobody matches those filters."}
                          </span>
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/*
             * The foot of the list. Empty and zero-height when there is one
             * short page, which is why the margins live on the children.
             */}
            <div className="flex flex-col items-center">
              <Pagination
                page={page}
                pageCount={list.data?.pageCount ?? 1}
                onChange={goToPage}
              />
              {/*
               * Having read to the bottom, the search and the filters that
               * produced this list are a very long scroll behind; this is the
               * one place the reader is guaranteed to be standing when they
               * want them. Ten rows or fewer is about a screen and a half and
               * needs no help, and neither does a desktop, where the whole page
               * is one wheel-flick or a Home key away and the button would only
               * be clutter under a pager nobody has to scroll to reach.
               */}
              {rows.length > 10 && (
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0 })}
                  className="mt-4 flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[8px] px-3.5 text-[12.5px] font-semibold lg:hidden"
                  style={{
                    background: "var(--surface)",
                    color: "var(--muted)",
                    boxShadow: "var(--ring)",
                  }}
                >
                  <Icon
                    name="chevronDown"
                    size={14}
                    color="currentColor"
                    className="rotate-180"
                  />
                  Back to search
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {adding && (
        <AddPersonDialog
          onClose={() => setAdding(false)}
          onCreated={() => utils.users.invalidate()}
        />
      )}
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={() => utils.users.invalidate()}
        />
      )}
      {openUserId && (
        <UserDetailDialog
          userId={openUserId}
          canManage={canManage}
          canManageRoles={canManageRoles}
          onClose={() => setOpenUserId(null)}
        />
      )}
    </>
  );
}

/** The roles a person holds, drawn the same way in the cards and the table. */
function RoleBadges({
  roles,
}: {
  roles: { id: string; name: string; key: string | null }[];
}) {
  if (roles.length === 0) return <Badge tone="orange">No role</Badge>;
  return (
    <>
      {roles.map((r) => (
        <Badge key={r.id} tone={r.key === "admin" ? "red" : "slate"}>
          {r.name}
        </Badge>
      ))}
    </>
  );
}

/** Whether the account works, and if not, whose fault that is. */
function StatusBadge({
  user,
}: {
  user: { isActive: boolean; email: string | null; hasSignedIn: boolean };
}) {
  if (!user.isActive && !user.email) {
    // Shut out by the college's paperwork rather than by anybody here, which is
    // not the same as disabled and should not be read in red across 133 rows.
    return <Badge tone="neutral">waiting on an address</Badge>;
  }
  if (!user.isActive) {
    return (
      <Badge tone="red" dot>
        disabled
      </Badge>
    );
  }
  if (user.hasSignedIn) {
    return (
      <Badge tone="green" dot>
        active
      </Badge>
    );
  }
  return <Badge tone="neutral">not signed in</Badge>;
}

function Th({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      className="text-muted px-3.5 py-2.5 text-left text-[11px] font-bold tracking-[0.05em] uppercase"
      style={{ boxShadow: "inset 0 -1px 0 var(--hair)", ...style }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  style,
  onClick,
  colSpan,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  colSpan?: number;
}) {
  return (
    <td
      onClick={onClick}
      colSpan={colSpan}
      className="text-ink px-3.5 py-3 align-middle text-[13.5px]"
      style={{ boxShadow: "inset 0 -1px 0 var(--hair-soft)", ...style }}
    >
      {children}
    </td>
  );
}

/** Compact pager: first, last and a window around the current page. */
function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const window = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const pages = [...window]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
      <PageBtn disabled={page === 1} onClick={() => onChange(page - 1)}>
        <Icon name="chevronLeft" size={14} color="currentColor" />
      </PageBtn>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && pages[i - 1]! < p - 1 && (
            <span className="text-faint px-1 text-[12px]">…</span>
          )}
          <PageBtn active={p === page} onClick={() => onChange(p)}>
            {p}
          </PageBtn>
        </span>
      ))}
      <PageBtn disabled={page === pageCount} onClick={() => onChange(page + 1)}>
        <Icon name="chevronRight" size={14} color="currentColor" />
      </PageBtn>
    </div>
  );
}

function PageBtn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-[8px] px-2 text-[12.5px] font-semibold lg:h-8 lg:min-w-8"
      style={{
        background: active ? "var(--slate)" : "var(--surface)",
        color: active ? "#fff" : "var(--muted)",
        boxShadow: active ? "none" : "var(--ring)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
