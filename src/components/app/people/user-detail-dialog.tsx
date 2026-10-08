"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Dialog } from "~/components/ui/dialog";
import { Field, Input } from "~/components/ui/field";
import {
  EntityPicker,
  pickerPage,
  useDebounced,
} from "~/components/ui/entity-picker";
import { groupCard, roleCard } from "./entity-cards";
import { Icon } from "~/components/ui/icon";
import { Skeleton } from "~/components/ui/skeleton";
import { contactAddress, NO_ADDRESS, personName } from "~/lib/people";
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
  const roleRows = (roles.data?.rows ?? []).filter((r) =>
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
      // Who this is, in the header, so it stays in view while the body
      // scrolls through their groups and permissions.
      subtitle={
        data ? (
          <>
            {contactAddress(data.email) ?? (
              <span className="text-faint italic">{NO_ADDRESS}</span>
            )}
            {data.prn && ` · ${data.prn}`}
          </>
        ) : undefined
      }
      icon="users"
      onClose={onClose}
      width={620}
      // The record's way out lives in the dialog's own footer, so Remove and
      // Close stay put under the thumb instead of scrolling away with the
      // last section of the form.
      footer={
        <>
          {data &&
            canManage &&
            (confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2 max-sm:justify-center sm:mr-auto">
                <span className="text-bad text-sm font-semibold max-sm:w-full max-sm:text-center">
                  Remove {personName(data, data.prn ?? "this person")}?
                </span>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => remove.mutate({ id: userId })}
                >
                  Yes, remove
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="danger-quiet"
                icon="trash"
                onClick={() => setConfirmDelete(true)}
                className="sm:mr-auto"
              >
                Remove person
              </Button>
            ))}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {!data ? (
        <div
          role="status"
          aria-label="Loading person"
          className="flex flex-col gap-4"
        >
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {error && (
            <Callout tone="bad" role="alert">
              {error}
            </Callout>
          )}

          {/*
           * The account's state first, before the fields: whether this person
           * can get in at all is the thing to know on opening the record, and
           * switching it is a real action, so it is a button rather than a
           * faint link at the end of a row.
           */}
          <div className="flex flex-wrap items-center gap-2">
            {data.hasSignedIn ? (
              <span className="text-muted text-sm">Has signed in</span>
            ) : (
              <Badge tone="neutral">Imported, never signed in</Badge>
            )}
            {!data.isActive &&
              (data.email ? (
                <Badge tone="red">Disabled</Badge>
              ) : (
                // The Email field says why; this is the account's state, and
                // it is waiting rather than switched off.
                <Badge tone="neutral">Waiting on an address</Badge>
              ))}
            {canManage && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  update.mutate({ id: userId, isActive: !data.isActive })
                }
                className="ml-auto"
              >
                {data.isActive ? "Disable account" : "Re-enable account"}
              </Button>
            )}
          </div>

          {/*
           * Phones get 16px type in every field from the global `pointer:
           * coarse` rule: below that, Safari zooms the page in as the field
           * takes focus, which on a dialog leaves it half off screen. A
           * read-only viewer's fields are drawn disabled (on the paper, muted
           * ink) so they no longer look typeable.
           */}
          <div className="flex flex-col gap-3.5">
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canManage}
                />
              )}
            </Field>
            {/*
             * An address and a PRN side by side leave about 130px each on a
             * phone, which truncates the very thing being checked; they stack
             * until there is room to read both.
             */}
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field
                label="Email"
                // Why the account is disabled, said where the address is
                // missing rather than left to be inferred from the badge.
                hint={
                  !data.email
                    ? "The college has not sent one. They are on the roll and count everywhere they are listed, but cannot sign in until it arrives."
                    : undefined
                }
              >
                {(id) => (
                  <Input
                    id={id}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!canManage}
                    placeholder={NO_ADDRESS}
                  />
                )}
              </Field>
              <Field label="PRN">
                {(id) => (
                  <Input
                    id={id}
                    value={prn}
                    onChange={(e) => setPrn(e.target.value)}
                    disabled={!canManage}
                    placeholder="11 digits"
                    className="font-mono"
                  />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field label="Department">
                {(id) => (
                  <Input
                    id={id}
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={!canManage}
                    placeholder="Faculty only"
                  />
                )}
              </Field>
              <Field label="Short name">
                {(id) => (
                  <Input
                    id={id}
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    disabled={!canManage}
                    placeholder="Shown on timetable cards"
                  />
                )}
              </Field>
            </div>
            {canManage && detailsChanged && (
              <SaveRow
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
              >
                Save details
              </SaveRow>
            )}
          </div>

          <Section
            title="Groups"
            description={
              membership.data && !membership.data.hasStudentProfile
                ? "Give this person a PRN and save, then you can add them to groups. Membership is recorded against their student record."
                : "The cohorts whose classes appear on their timetable."
            }
          >
            {!(membership.data && !membership.data.hasStudentProfile) && (
              <>
                <EntityPicker
                  selected={groupIds.map((id) => ({
                    id,
                    label:
                      allGroups.data?.rows.find((g) => g.id === id)?.label ??
                      membership.data?.groups.find((g) => g.id === id)?.label ??
                      "Group",
                  }))}
                  onChange={setGroupIds}
                  page={pickerPage(allGroups.data, (rows) =>
                    rows.map(groupCard),
                  )}
                  loading={allGroups.isLoading}
                  query={groupQuery}
                  onQueryChange={setGroupQuery}
                  onLoadMore={() => setGroupPageSize((n) => n + 20)}
                  disabled={!canManage}
                  placeholder="Search groups…"
                  emptyLabel="Not in any group"
                />
                {canManage && groupsChanged && (
                  <SaveRow
                    disabled={busy}
                    onClick={() => setGroups.mutate({ id: userId, groupIds })}
                  >
                    Save groups
                  </SaveRow>
                )}
              </>
            )}
          </Section>

          <Section
            title="Roles"
            description="Someone can hold several at once: a lecturer who also coordinates gets both sets of permissions."
          >
            <EntityPicker
              selected={(roles.data?.rows ?? [])
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
              <SaveRow
                disabled={busy}
                onClick={() => setRoles.mutate({ id: userId, roleIds })}
              >
                Save roles
              </SaveRow>
            )}
          </Section>

          {canManageRoles && (
            // Still a native disclosure: collapsed, its controls have no
            // boxes, which is how the dialog's focus trap knows to skip them.
            // The browser's black triangle is swapped for the app's chevron,
            // which turns as it opens.
            <details className="group pt-4 shadow-[inset_0_1px_0_var(--hair-soft)]">
              <summary className="font-display text-title text-md flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[8px] font-semibold tracking-[-0.01em] lg:min-h-8 [&::-webkit-details-marker]:hidden">
                <Icon
                  name="chevronRight"
                  size={16}
                  stroke={2}
                  className="text-muted transition-transform duration-200 ease-out group-open:rotate-90 motion-reduce:transition-none"
                />
                Extra permissions for this person
              </summary>
              <p className="text-muted mt-1 mb-3 text-sm">
                Granted on top of their roles. Prefer changing a role when the
                same change applies to a group of people.
              </p>
              <PermissionEditor value={extra} onChange={setExtra} />
              {extra !== data.extraPermissions && (
                <SaveRow
                  disabled={busy}
                  onClick={() =>
                    setPerms.mutate({ id: userId, permissions: extra })
                  }
                >
                  Save permissions
                </SaveRow>
              )}
            </details>
          )}
        </div>
      )}
    </Dialog>
  );
}

/**
 * One part of the record: a heading, a line saying what it is for, and its
 * controls. Each starts on a hairline with the same space above it, so the
 * form reads as four things rather than one long list of equal weight.
 */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 pt-5 shadow-[inset_0_1px_0_var(--hair-soft)]"
    >
      <div>
        <h3
          id={id}
          className="font-display text-title text-md font-semibold tracking-[-0.01em]"
        >
          {title}
        </h3>
        {description && (
          <p className="text-muted mt-0.5 text-sm">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * A section's save, which appears only once something in it has changed.
 * Always in the same place, on the section's trailing edge, and it fades in
 * rather than popping, so the eye catches it arriving.
 */
function SaveRow({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="plr-fade flex justify-end pt-1">
      <Button variant="primary" size="sm" disabled={disabled} onClick={onClick}>
        {children}
      </Button>
    </div>
  );
}
