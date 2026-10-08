"use client";

import { useEffect, useRef, useState } from "react";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Avatar } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { EmptyState } from "~/components/ui/empty-state";
import { Input } from "~/components/ui/field";
import { Icon } from "~/components/ui/icon";
import { SearchSelect, useDebounced } from "~/components/ui/entity-picker";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
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
  // Held here rather than in the role manager so that "New role" can sit in
  // the same slot "Add person" does: the one action a tab is for stays put
  // when the tab changes, instead of jumping down a row.
  const [creatingRole, setCreatingRole] = useState(false);

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

  /** No rows yet because the first page is still on its way. */
  const loadingFirst = list.isLoading && rows.length === 0;
  /** No rows because the list could not be fetched, not because none match. */
  const failed = Boolean(list.error) && rows.length === 0;

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Everyone on the system, and what they can do"
      />
      <PageBody>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            items={[
              { value: "people" as const, label: "People" },
              { value: "roles" as const, label: "Roles" },
            ]}
            value={tab}
            onChange={setTab}
            // Two strips on one screen: unnamed, both are announced as the
            // same anonymous radio group.
            ariaLabel="View"
          />

          {/*
           * Each tab's actions in the one slot, so the button a tab is for is
           * always in the same place. Adding is the primary on the directory
           * and importing its alternative; on the roles tab, a new role.
           */}
          {tab === "people" && (canImport || canManage) && (
            <div className="flex flex-wrap items-center gap-2.5">
              {canImport && (
                <Button
                  variant="secondary"
                  icon="upload"
                  onClick={() => setImporting(true)}
                >
                  Import CSV
                </Button>
              )}
              {canManage && (
                <Button
                  variant="primary"
                  icon="plus"
                  onClick={() => setAdding(true)}
                >
                  Add person
                </Button>
              )}
            </div>
          )}
          {tab === "roles" && canManageRoles && (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => setCreatingRole(true)}
            >
              New role
            </Button>
          )}
        </div>

        {tab === "roles" ? (
          <RoleManager
            canManage={canManageRoles}
            creating={creatingRole}
            onCreatingChange={setCreatingRole}
          />
        ) : (
          <>
            {notice && (
              <Callout
                tone="info"
                role="status"
                className="mb-4"
                action={
                  <IconButton
                    icon="x"
                    label="Dismiss"
                    size="sm"
                    onClick={() => setNotice(null)}
                    className="-my-1.5"
                  />
                }
              >
                {notice}
              </Callout>
            )}

            {/*
             * The search leads the toolbar, because finding a person is what
             * the screen is for; the filters that narrow it follow, and the
             * page size and count sit at the far end where they are read
             * rather than used.
             */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Input
                icon="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email or PRN…"
                // The lens and the placeholder say what the field is; a label
                // above it would only repeat them, so it is named for a
                // screen reader instead. Phones get 16px type from the global
                // `pointer: coarse` rule, so Safari does not zoom in on focus.
                aria-label="Search people"
                className="w-full sm:w-72"
              />
              {query !== debounced && preview.data !== undefined && (
                <span className="text-muted font-mono text-xs tabular-nums">
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
                  ariaLabel="Account status"
                />
              </div>

              <div className="ml-auto flex items-center gap-3">
                <div className="text-muted flex items-center gap-2 text-xs">
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
                <span className="text-muted font-mono text-xs tabular-nums">
                  {list.data?.total ?? 0} total
                </span>
              </div>
            </div>

            {canManage && selected.size > 0 && (
              <div className="bg-tint-selected mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[12px] px-4 py-2 shadow-[inset_0_0_0_1px_var(--hair)]">
                <span className="text-title text-sm font-semibold tabular-nums">
                  {selected.size} selected
                </span>
                {/* Removal happens on this press, with no second step, so it
                    is drawn as the final, destructive one. */}
                <Button
                  variant="danger"
                  size="sm"
                  icon="trash"
                  disabled={bulkDelete.isPending}
                  onClick={() => bulkDelete.mutate({ ids: [...selected] })}
                >
                  Remove selected
                </Button>
              </div>
            )}

            {failed && (
              <Callout
                tone="bad"
                className="mb-4"
                title="Could not load people"
              >
                {list.error?.message} Reload the page to try again.
              </Callout>
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
            {!failed && (
              <Card pad={8} className="md:hidden">
                {canManage && rows.length > 0 && (
                  <div className="px-3 shadow-[inset_0_-1px_0_var(--hair-soft)]">
                    <Checkbox
                      checked={allSelected}
                      onChange={toggleAll}
                      label="Select all"
                      className="text-muted"
                    />
                  </div>
                )}
                {rows.map((u) => (
                  <div
                    key={u.id}
                    // One left edge for the checkbox's column, one for the
                    // avatar and one for the name, and everything under the
                    // name (address, PRN, badges) hangs from the name's edge.
                    className="flex items-start gap-1 py-1 shadow-[inset_0_-1px_0_var(--hair-soft)] last:shadow-none"
                  >
                    {canManage && (
                      <Checkbox
                        checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                        ariaLabel={`Select ${personName(u, u.prn ?? "this person")}`}
                        className="h-12 w-10 shrink-0 items-center justify-center py-0"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenUserId(u.id)}
                      className={`hover:bg-tint-hover active:bg-tint flex min-h-12 min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-[10px] py-2 pr-2 text-left transition-colors duration-150 ${canManage ? "pl-1" : "pl-2"}`}
                    >
                      <Avatar
                        name={personName(u, u.prn ?? "?")}
                        size={32}
                        tone="soft"
                        className="mt-px"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-title block truncate text-base font-semibold">
                          {personName(u, u.prn ?? "Unnamed")}
                        </span>
                        <PersonAddress email={u.email} />
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {u.prn && (
                            <span className="text-muted font-mono text-xs tabular-nums">
                              {u.prn}
                            </span>
                          )}
                          <RoleBadges roles={u.roles} />
                          <StatusBadge user={u} />
                        </span>
                      </span>
                    </button>
                  </div>
                ))}
                {loadingFirst && <ListSkeleton />}
                {rows.length === 0 && !list.isLoading && (
                  <NoMatches
                    query={debounced}
                    filtered={roleId !== undefined || status !== "all"}
                  />
                )}
              </Card>
            )}

            {!failed && (
              <Card pad={8} className="hidden md:block">
                {/* Long role names can still outrun a tablet; the card scrolls. */}
                <div className="plr-scroll overflow-x-auto">
                  <table className="w-full min-w-155 border-collapse">
                    <thead>
                      <tr>
                        {canManage && (
                          <Th className="w-11">
                            {/* Nothing to select on an empty page, so no box. */}
                            {rows.length > 0 && (
                              <Checkbox
                                checked={allSelected}
                                onChange={toggleAll}
                                ariaLabel="Select all"
                                className="-my-2 h-9 items-center justify-center py-0"
                              />
                            )}
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
                          // The row is the pointer's target, the name the
                          // keyboard's: a click anywhere opens the record, and
                          // the name is a real button so Tab reaches it.
                          className="hover:bg-tint-hover focus-within:bg-tint-hover cursor-pointer transition-colors duration-150 [&:last-child>td]:shadow-none"
                          onClick={() => setOpenUserId(u.id)}
                        >
                          {canManage && (
                            <Td onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selected.has(u.id)}
                                onChange={() => toggleOne(u.id)}
                                ariaLabel={`Select ${personName(u, u.prn ?? "this person")}`}
                                className="-my-2 h-11 items-center justify-center py-0"
                              />
                            </Td>
                          )}
                          <Td>
                            <span className="flex items-center gap-3">
                              <Avatar
                                name={personName(u, u.prn ?? "?")}
                                size={32}
                                tone="soft"
                              />
                              <span className="min-w-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    // The row would open it too; once is enough.
                                    e.stopPropagation();
                                    setOpenUserId(u.id);
                                  }}
                                  className="text-title block max-w-full cursor-pointer truncate rounded-[4px] text-left text-base font-semibold"
                                >
                                  {personName(u, u.prn ?? "Unnamed")}
                                </button>
                                <PersonAddress email={u.email} />
                              </span>
                            </span>
                          </Td>
                          <Td>
                            {/* Staff have no PRN; the cell is left empty rather
                                than filled with a dash that reads as data. */}
                            {u.prn && (
                              <span className="text-muted font-mono text-xs tabular-nums">
                                {u.prn}
                              </span>
                            )}
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
                        // The card's own edge closes the table; a hairline
                        // under the message as well would draw it twice.
                        <tr className="[&>td]:shadow-none">
                          {/*
                            Across every column, or the row is laid out inside the
                            first one — which is the checkbox column whenever the
                            reader can manage users, so a centred message ends up
                            centred in 44px, well left of the table it belongs to.
                          */}
                          <Td colSpan={canManage ? 5 : 4}>
                            {list.isLoading ? (
                              <ListSkeleton />
                            ) : (
                              <NoMatches
                                query={debounced}
                                filtered={
                                  roleId !== undefined || status !== "all"
                                }
                              />
                            )}
                          </Td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.scrollTo({ top: 0 })}
                  className="mt-4 lg:hidden"
                >
                  <Icon
                    name="chevronDown"
                    size={14}
                    stroke={2}
                    className="rotate-180"
                  />
                  Back to search
                </Button>
              )}
            </div>
          </>
        )}
      </PageBody>

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

/**
 * The rows that stand in for the first page while it loads: an avatar tile and
 * two lines, the shape of a person, so nothing jumps when they arrive.
 */
function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading people" className="flex flex-col">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton round className="h-8 w-8 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The filters matched nobody. Says so, and echoes the search when there was
 * one, so the reader can see which word to change. The role and status are
 * only named when one is actually set, so the hint never points at a filter
 * the reader has not touched.
 */
function NoMatches({ query, filtered }: { query: string; filtered: boolean }) {
  return (
    <EmptyState icon="search" title="Nobody matches those filters" compact>
      {query
        ? `Nothing found for “${query}”${filtered ? " with the role and status chosen" : ""}.`
        : filtered
          ? "Try another role or status."
          : "Try a different search."}
    </EmptyState>
  );
}

/** The roles a person holds, drawn the same way in the cards and the table. */
function RoleBadges({
  roles,
}: {
  roles: { id: string; name: string; key: string | null }[];
}) {
  if (roles.length === 0) return <Badge tone="orange">No role</Badge>;
  // Every role is slate, Administrator included: red is kept for the live
  // lamp and for danger, and holding a powerful role is neither.
  return (
    <>
      {roles.map((r) => (
        <Badge key={r.id} tone="slate">
          {r.name}
        </Badge>
      ))}
    </>
  );
}

/**
 * Whether the account works, and if not, whose fault that is.
 *
 * The ordinary case is said in quiet text and only the exceptions get a badge:
 * thirty green "active" pills down a page were noise, and the rows somebody is
 * scanning for are the ones that are not.
 */
function StatusBadge({
  user,
}: {
  user: { isActive: boolean; email: string | null; hasSignedIn: boolean };
}) {
  if (!user.isActive && !user.email) {
    // Shut out by the college's paperwork rather than by anybody here, which is
    // not the same as disabled and should not be read in red across 133 rows.
    return <Badge tone="neutral">Waiting on an address</Badge>;
  }
  if (!user.isActive) {
    return <Badge tone="red">Disabled</Badge>;
  }
  if (user.hasSignedIn) {
    return <span className="text-muted text-sm">Active</span>;
  }
  return <Badge tone="neutral">Not signed in</Badge>;
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-muted text-2xs px-3 py-2 text-left font-semibold shadow-[inset_0_-1px_0_var(--hair)] ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  onClick,
  colSpan,
}: {
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  colSpan?: number;
}) {
  return (
    <td
      onClick={onClick}
      colSpan={colSpan}
      className="text-ink px-3 py-2.5 align-middle text-sm shadow-[inset_0_-1px_0_var(--hair-soft)]"
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
    <nav
      aria-label="Pages"
      className="mt-4 flex flex-wrap items-center justify-center gap-1.5"
    >
      <IconButton
        icon="chevronLeft"
        label="Previous page"
        variant="secondary"
        size="sm"
        iconSize={14}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      />
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && pages[i - 1]! < p - 1 && (
            <span className="text-faint px-1 text-xs">…</span>
          )}
          <PageBtn active={p === page} onClick={() => onChange(p)}>
            {p}
          </PageBtn>
        </span>
      ))}
      <IconButton
        icon="chevronRight"
        label="Next page"
        variant="secondary"
        size="sm"
        iconSize={14}
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
      />
    </nav>
  );
}

/**
 * One page number. The current page is a selected state, so it wears the
 * slate wash a chosen row does rather than the slate fill of a primary button,
 * which would put a second "do this" beside "Add person".
 */
function PageBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-[var(--radius-btn)] px-2 font-mono text-xs font-semibold tabular-nums transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.95] lg:h-8 lg:min-w-8 ${
        active
          ? "bg-tint-selected text-slate-ink shadow-[inset_0_0_0_1px_var(--hair)]"
          : "bg-surface text-muted hover:bg-surface-hover hover:text-title shadow-[inset_0_0_0_1px_var(--card-ring)]"
      }`}
    >
      {children}
    </button>
  );
}
