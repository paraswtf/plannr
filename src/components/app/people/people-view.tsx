"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api } from "~/trpc/react";
import { AddPersonDialog } from "./add-person-dialog";
import { ImportDialog } from "./import-dialog";
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
  const roles = api.roles.list.useQuery();

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
      <div className="px-9 pt-2 pb-10">
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
            <div className="flex items-center gap-2.5">
              {canImport && (
                <button
                  type="button"
                  onClick={() => setImporting(true)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold"
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
                  className="cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white"
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
                  className="cursor-pointer"
                >
                  <Icon name="x" size={14} color="var(--muted)" />
                </button>
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative w-64">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
                  <Icon name="search" size={15} color="var(--faint)" />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email or PRN…"
                  className="bg-surface w-full rounded-[10px] py-2 pr-3 pl-9 text-[13.5px] outline-none"
                  style={{ boxShadow: "var(--ring)" }}
                />
              </div>
              {query !== debounced && preview.data !== undefined && (
                <span className="text-faint font-mono text-[12px]">
                  {preview.data} match{preview.data === 1 ? "" : "es"}
                </span>
              )}

              <select
                value={roleId ?? ""}
                onChange={(e) => {
                  setRoleId(e.target.value || undefined);
                  setPage(1);
                }}
                className="bg-surface rounded-[10px] px-3 py-2 text-[13px]"
                style={{ boxShadow: "var(--ring)" }}
              >
                <option value="">All roles</option>
                {(roles.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.userCount})
                  </option>
                ))}
              </select>

              <Segmented
                items={STATUSES}
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                size="sm"
              />

              <div className="ml-auto flex items-center gap-3">
                <label className="text-faint flex items-center gap-2 text-[12px]">
                  Show
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-surface rounded-[8px] px-2 py-1 text-[12px]"
                    style={{ boxShadow: "var(--ring)" }}
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-faint font-mono text-[12px]">
                  {list.data?.total ?? 0} total
                </span>
              </div>
            </div>

            {canManage && selected.size > 0 && (
              <div
                className="mb-3 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5"
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
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold text-white"
                  style={{ background: "var(--red)" }}
                >
                  <Icon name="trash" size={13} color="#fff" />
                  Remove selected
                </button>
              </div>
            )}

            <Card pad={8}>
              <table className="w-full border-collapse">
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
                            aria-label={`Select ${u.email}`}
                          />
                        </Td>
                      )}
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                            style={{ background: "var(--slate)" }}
                          >
                            {(u.name ?? u.email).charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="text-title block truncate font-semibold">
                              {u.name ?? "—"}
                            </span>
                            <span className="text-faint block truncate text-[12px]">
                              {u.email}
                            </span>
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
                          {u.roles.length > 0 ? (
                            u.roles.map((r) => (
                              <Badge
                                key={r.id}
                                tone={r.key === "admin" ? "red" : "slate"}
                              >
                                {r.name}
                              </Badge>
                            ))
                          ) : (
                            <Badge tone="orange">No role</Badge>
                          )}
                        </span>
                      </Td>
                      <Td>
                        {!u.isActive ? (
                          <Badge tone="red" dot>
                            disabled
                          </Badge>
                        ) : u.hasSignedIn ? (
                          <Badge tone="green" dot>
                            active
                          </Badge>
                        ) : (
                          <Badge tone="neutral">not signed in</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <Td style={{ textAlign: "center", padding: "28px 0" }}>
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
            </Card>

            <Pagination
              page={page}
              pageCount={list.data?.pageCount ?? 1}
              onChange={setPage}
            />
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
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <td
      onClick={onClick}
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
    <div className="mt-4 flex items-center justify-center gap-1.5">
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
      className="flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-[8px] px-2 text-[12.5px] font-semibold"
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
