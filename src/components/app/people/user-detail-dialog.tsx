"use client";

import { useEffect, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Dialog } from "~/components/ui/dialog";
import { EntityPicker, useDebounced } from "~/components/ui/entity-picker";
import { groupCard, roleCard } from "./entity-cards";
import { Icon } from "~/components/ui/icon";
import { NO_ADDRESS, personName } from "~/lib/people";
import { api } from "~/trpc/react";
import { PermissionEditor } from "./permission-editor";

/** Edit one person: their details, their roles, and any personal grants. */
export function UserDetailDialog({
  userId,
  canManage,
  canManageRoles,
  onClose,
}: {
  userId: string;
  canManage: boolean;
  canManageRoles: boolean;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const user = api.users.byId.useQuery({ id: userId });
  const [roleQuery, setRoleQuery] = useState("");
  const roles = api.roles.list.useQuery();
  const debouncedRole = useDebounced(roleQuery);
  const roleRows = (roles.data ?? []).filter((r) =>
    debouncedRole
      ? r.name.toLowerCase().includes(debouncedRole.toLowerCase())
      : true,
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [prn, setPrn] = useState("");
  const [department, setDepartment] = useState("");
  const [shortName, setShortName] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [extra, setExtra] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!user.data) return;
    setName(user.data.name ?? "");
    setEmail(user.data.email ?? "");
    setPrn(user.data.prn ?? "");
    setDepartment(user.data.department ?? "");
    setShortName(user.data.shortName ?? "");
    setRoleIds(user.data.roles.map((r) => r.id));
    setExtra(user.data.extraPermissions);
  }, [user.data]);

  const membership = api.users.groups.useQuery({ id: userId });
  const [groupQuery, setGroupQuery] = useState("");
  const [groupPageSize, setGroupPageSize] = useState(20);
  const allGroups = api.groups.list.useQuery({
    query: useDebounced(groupQuery) || undefined,
    pageSize: groupPageSize,
    // Keeps the person's current groups visible while searching for others.
    includeIds: groupIds.length ? groupIds : undefined,
  });

  useEffect(() => {
    if (!membership.data) return;
    setGroupIds(membership.data.groups.map((g) => g.id));
  }, [membership.data]);

  const onError = (e: { message: string }) => setError(e.message);
  const refresh = async () => {
    await utils.users.invalidate();
    setError(null);
  };

  const update = api.users.update.useMutation({ onSuccess: refresh, onError });
  const setRoles = api.users.setRoles.useMutation({
    onSuccess: refresh,
    onError,
  });
  const setGroups = api.users.setGroups.useMutation({
    onSuccess: async () => {
      await utils.users.groups.invalidate();
      await utils.groups.invalidate();
      setError(null);
    },
    onError,
  });
  const setPerms = api.users.setExtraPermissions.useMutation({
    onSuccess: refresh,
    onError,
  });
  const remove = api.users.delete.useMutation({
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError,
  });

  const data = user.data;
  const busy =
    update.isPending ||
    setRoles.isPending ||
    setPerms.isPending ||
    setGroups.isPending ||
    remove.isPending;

  const rolesChanged =
    data &&
    (roleIds.length !== data.roles.length ||
      roleIds.some((id) => !data.roles.some((r) => r.id === id)));

  const detailsChanged =
    data &&
    (name !== (data.name ?? "") ||
      email !== (data.email ?? "") ||
      prn !== (data.prn ?? "") ||
      department !== (data.department ?? "") ||
      shortName !== (data.shortName ?? ""));

  const currentGroupIds = membership.data?.groups.map((g) => g.id) ?? [];
  const groupsChanged =
    groupIds.length !== currentGroupIds.length ||
    groupIds.some((id) => !currentGroupIds.includes(id));

  return (
    <Dialog
      open
      title={data?.name ?? "Person"}
      icon="users"
      onClose={onClose}
      width={620}
    >
      {!data ? (
        <p className="text-muted text-[13.5px]">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
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

          <div className="flex flex-col gap-3">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage}
                // 16px on a phone: below that, Safari zooms the page in as the
                // field takes focus, which on a dialog leaves it half off
                // screen.
                className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
                style={{ boxShadow: "var(--ring)" }}
              />
            </Field>
            {/*
             * An address and a PRN side by side leave about 130px each on a
             * phone, which truncates the very thing being checked; they stack
             * until there is room to read both.
             */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Email">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!canManage}
                  placeholder={NO_ADDRESS}
                  className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
                  style={{ boxShadow: "var(--ring)" }}
                />
                {!data.email && (
                  // Why the account is disabled, said where the address is
                  // missing rather than left to be inferred from the badge.
                  <span className="text-muted text-[11.5px]">
                    The college has not sent one. They are on the roll and count
                    everywhere they are listed, but cannot sign in until it
                    arrives.
                  </span>
                )}
              </Field>
              <Field label="PRN">
                <input
                  value={prn}
                  onChange={(e) => setPrn(e.target.value)}
                  disabled={!canManage}
                  placeholder="11 digits"
                  className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 font-mono text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
                  style={{ boxShadow: "var(--ring)" }}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Department">
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  disabled={!canManage}
                  placeholder="Faculty only"
                  className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
                  style={{ boxShadow: "var(--ring)" }}
                />
              </Field>
              <Field label="Short name">
                <input
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  disabled={!canManage}
                  placeholder="Shown on timetable cards"
                  className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
                  style={{ boxShadow: "var(--ring)" }}
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.hasSignedIn ? (
                <Badge tone="green" dot>
                  has signed in
                </Badge>
              ) : (
                <Badge tone="neutral">imported, never signed in</Badge>
              )}
              {!data.isActive &&
                (data.email ? (
                  <Badge tone="red">disabled</Badge>
                ) : (
                  // The field above says why; this is the account's state, and
                  // it is waiting rather than switched off.
                  <Badge tone="neutral">waiting on an address</Badge>
                ))}
              {canManage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    update.mutate({ id: userId, isActive: !data.isActive })
                  }
                  className="text-muted ml-auto inline-flex min-h-10 cursor-pointer items-center text-[12px] font-semibold lg:min-h-0"
                >
                  {data.isActive ? "Disable account" : "Re-enable account"}
                </button>
              )}
            </div>
            {canManage && detailsChanged && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  update.mutate({
                    id: userId,
                    name,
                    // An empty box means the address is still outstanding, not
                    // that it should be cleared: the placeholder behind it is
                    // the import's business and nothing here can improve on it.
                    email: email.trim() || undefined,
                    // Clearing the box removes the student record entirely.
                    prn: prn.trim() ? prn.trim() : null,
                    department: department.trim() || null,
                    shortName: shortName.trim() || null,
                  })
                }
                className="min-h-10 cursor-pointer self-start rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white lg:min-h-0"
                style={{ background: "var(--slate)" }}
              >
                Save details
              </button>
            )}
          </div>

          <div>
            <SectionTitle>Groups</SectionTitle>
            {membership.data && !membership.data.hasStudentProfile ? (
              <p className="text-muted text-[12.5px]">
                Give this person a PRN and save, then you can add them to groups
                — membership is recorded against their student record.
              </p>
            ) : (
              <>
                <p className="text-muted mb-2.5 text-[12.5px]">
                  The cohorts whose classes appear on their timetable.
                </p>
                <EntityPicker
                  selected={groupIds.map((id) => ({
                    id,
                    label:
                      allGroups.data?.rows.find((g) => g.id === id)?.label ??
                      membership.data?.groups.find((g) => g.id === id)?.label ??
                      "Group",
                  }))}
                  onChange={setGroupIds}
                  page={
                    allGroups.data && {
                      ...allGroups.data,
                      rows: allGroups.data.rows.map(groupCard),
                    }
                  }
                  loading={allGroups.isLoading}
                  query={groupQuery}
                  onQueryChange={setGroupQuery}
                  onLoadMore={() => setGroupPageSize((n) => n + 20)}
                  disabled={!canManage}
                  placeholder="Search groups…"
                  emptyLabel="Not in any group"
                />
                {canManage && groupsChanged && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setGroups.mutate({ id: userId, groupIds })}
                    className="mt-3 min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white lg:min-h-0"
                    style={{ background: "var(--slate)" }}
                  >
                    Save groups
                  </button>
                )}
              </>
            )}
          </div>

          <div>
            <SectionTitle>Roles</SectionTitle>
            <p className="text-muted mb-2.5 text-[12.5px]">
              Someone can hold several at once — a lecturer who also coordinates
              gets both sets of permissions.
            </p>
            <EntityPicker
              selected={(roles.data ?? [])
                .filter((r) => roleIds.includes(r.id))
                .map(roleCard)}
              onChange={setRoleIds}
              page={{
                rows: roleRows.map(roleCard),
                total: roleRows.length,
                hasMore: false,
              }}
              loading={roles.isLoading}
              query={roleQuery}
              onQueryChange={setRoleQuery}
              disabled={!canManage}
              placeholder="Search roles…"
              emptyLabel="No roles"
              listId="user-roles"
            />
            {canManage && rolesChanged && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setRoles.mutate({ id: userId, roleIds })}
                className="mt-3 min-h-10 cursor-pointer rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold text-white lg:min-h-0"
                style={{ background: "var(--slate)" }}
              >
                Save roles
              </button>
            )}
          </div>

          {canManageRoles && (
            <details>
              <summary className="text-title cursor-pointer py-2.5 text-[13.5px] font-semibold lg:py-0">
                Extra permissions for this person
              </summary>
              <p className="text-muted mt-1.5 mb-3 text-[12.5px]">
                Granted on top of their roles. Prefer changing a role when the
                same change applies to a group of people.
              </p>
              <PermissionEditor value={extra} onChange={setExtra} />
              {extra !== data.extraPermissions && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setPerms.mutate({ id: userId, permissions: extra })
                  }
                  className="mt-3 min-h-10 cursor-pointer rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold text-white lg:min-h-0"
                  style={{ background: "var(--slate)" }}
                >
                  Save permissions
                </button>
              )}
            </details>
          )}

          <div
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-4"
            style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
          >
            {canManage ? (
              confirmDelete ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-[#b02636]">
                    Remove {personName(data, data.prn ?? "this person")}?
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove.mutate({ id: userId })}
                    className="min-h-10 cursor-pointer rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold text-white lg:min-h-0"
                    style={{ background: "var(--red)" }}
                  >
                    Yes, remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-muted inline-flex min-h-10 cursor-pointer items-center text-[12.5px] lg:min-h-0"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-[#b02636] lg:min-h-0"
                >
                  <Icon name="trash" size={13} color="var(--red)" />
                  Remove person
                </button>
              )
            ) : (
              <span />
            )}

            <span className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-muted min-h-10 cursor-pointer rounded-[8px] px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
                style={{ boxShadow: "var(--ring)" }}
              >
                Close
              </button>
            </span>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Field({
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-title mb-1 text-[14px] font-bold">{children}</h3>;
}
