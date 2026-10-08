"use client";

import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { Field, Input } from "~/components/ui/field";
import { Skeleton } from "~/components/ui/skeleton";
import {
  PermissionBitField,
  PERMISSION_CATALOG,
  PermissionFlags,
} from "~/lib/permissions";
import { api } from "~/trpc/react";
import { PermissionEditor } from "./permission-editor";

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  permissions: string;
  isSystem: boolean;
  userCount: number;
};

/**
 * Lists roles and edits the custom ones. The four built-ins are read-only.
 *
 * `creating` and `onCreatingChange` let the page hold the "New role" button in
 * its own action slot; left out, the manager draws the button itself, beside
 * its introduction, as it always did.
 */
export function RoleManager({
  canManage,
  creating: creatingProp,
  onCreatingChange,
}: {
  canManage: boolean;
  creating?: boolean;
  onCreatingChange?: (creating: boolean) => void;
}) {
  const utils = api.useUtils();
  const roles = api.roles.list.useQuery();
  const [editing, setEditing] = useState<string | null>(null);
  const [creatingOwn, setCreatingOwn] = useState(false);
  const controlled = onCreatingChange !== undefined;
  const creating = controlled ? Boolean(creatingProp) : creatingOwn;
  const setCreating = controlled ? onCreatingChange : setCreatingOwn;

  const rows = roles.data?.rows ?? [];
  const builtIn = rows.filter((r) => r.isSystem);
  const custom = rows.filter((r) => !r.isSystem);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted max-w-2xl text-sm">
          Roles bundle permissions. The four built-in roles are locked so their
          meaning is the same everywhere; create a custom role for anything
          specific to your institution.
        </p>
        {canManage && !controlled && (
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setCreating(true)}
          >
            New role
          </Button>
        )}
      </div>

      {roles.error && !roles.data ? (
        <Callout tone="bad" title="Could not load roles">
          {roles.error.message} Reload the page to try again.
        </Callout>
      ) : roles.isLoading ? (
        <Card pad={0}>
          <div role="status" aria-label="Loading roles">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 px-4 py-4 shadow-[inset_0_-1px_0_var(--hair-soft)] last:shadow-none"
              >
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        /*
         * Two lists rather than one grid of identical cards: the locked roles
         * every institution has, then the ones somebody here made. A role is a
         * row, read left to right as what it is, what it grants and who holds
         * it, so a long list scans down one edge instead of across three.
         */
        <div className="flex flex-col gap-7">
          <RoleGroup
            title="Built-in"
            roles={builtIn}
            canManage={canManage}
            onOpen={setEditing}
          />
          {custom.length > 0 && (
            <RoleGroup
              title="Custom"
              roles={custom}
              canManage={canManage}
              onOpen={setEditing}
            />
          )}
        </div>
      )}

      {creating && (
        <RoleDialog
          onClose={() => setCreating(false)}
          onSaved={() => utils.roles.invalidate()}
        />
      )}
      {editing && (
        <RoleDialog
          roleId={editing}
          onClose={() => setEditing(null)}
          onSaved={() => utils.roles.invalidate()}
        />
      )}
    </>
  );
}

function RoleGroup({
  title,
  roles,
  canManage,
  onOpen,
}: {
  title: string;
  roles: RoleRow[];
  canManage: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <section aria-label={`${title} roles`}>
      <h2 className="text-title mb-2.5 text-sm font-semibold">
        {title}
        <span className="text-faint ml-2 font-mono text-xs font-normal tabular-nums">
          {roles.length}
        </span>
      </h2>
      <Card pad={0}>
        {roles.map((role) => (
          <RoleRowView
            key={role.id}
            role={role}
            canManage={canManage}
            onOpen={() => onOpen(role.id)}
          />
        ))}
      </Card>
    </section>
  );
}

function RoleRowView({
  role,
  canManage,
  onOpen,
}: {
  role: RoleRow;
  canManage: boolean;
  onOpen: () => void;
}) {
  const bits = new PermissionBitField(BigInt(role.permissions));
  const held = PERMISSION_CATALOG.filter((p) =>
    bits.has(PermissionFlags[p.name]),
  );
  const verb = role.isSystem ? "View" : "Edit";

  return (
    // Stacked on a phone; from sm, three columns: the role, its grants, and
    // who holds it with the way in.
    <div className="flex flex-col gap-3 px-4 py-3.5 shadow-[inset_0_-1px_0_var(--hair-soft)] last:shadow-none sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_11rem] sm:items-center sm:gap-6">
      {/* Role names are typed by whoever creates the role, so the column has
          to be allowed to give way rather than push the row wider than the
          screen. */}
      <div className="min-w-0">
        <div className="text-title text-base font-semibold break-words">
          {role.name}
        </div>
        {role.description && (
          <div className="text-muted mt-0.5 text-sm">{role.description}</div>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {bits.has(PermissionFlags.Administrator) ? (
          // Slate, not red: full access is a fact about the role, and red is
          // kept for the live lamp and for danger.
          <Badge tone="slate">Full access</Badge>
        ) : held.length === 0 ? (
          <span className="text-faint text-xs italic">No permissions</span>
        ) : (
          <>
            {held.slice(0, 3).map((p) => (
              <Badge key={p.name} tone="neutral">
                {p.label}
              </Badge>
            ))}
            {held.length > 3 && (
              <span className="text-faint px-1 text-xs">
                +{held.length - 3} more
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <span className="text-muted font-mono text-xs whitespace-nowrap tabular-nums">
          {role.userCount} {role.userCount === 1 ? "person" : "people"}
        </span>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            iconAfter="chevronRight"
            onClick={onOpen}
            aria-label={`${verb} ${role.name}`}
            className="-mr-1.5"
          >
            {verb}
          </Button>
        )}
      </div>
    </div>
  );
}

function RoleDialog({
  roleId,
  onClose,
  onSaved,
}: {
  roleId?: string;
  onClose: () => void;
  onSaved: () => void | Promise<unknown>;
}) {
  const existing = api.roles.byId.useQuery(
    { id: roleId! },
    { enabled: Boolean(roleId) },
  );
  const role = roleId ? existing.data : null;
  const locked = role?.isSystem ?? false;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (role && !loaded) {
    setName(role.name);
    setDescription(role.description ?? "");
    setPermissions(role.permissions);
    setLoaded(true);
  }

  const onError = (e: { message: string }) => setError(e.message);
  const done = async () => {
    await onSaved();
    onClose();
  };

  const create = api.roles.create.useMutation({ onSuccess: done, onError });
  const update = api.roles.update.useMutation({ onSuccess: done, onError });
  const remove = api.roles.delete.useMutation({ onSuccess: done, onError });

  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <Dialog
      open
      title={
        roleId
          ? locked
            ? `${role?.name} (built-in)`
            : "Edit role"
          : "New role"
      }
      icon="layers"
      width={620}
      onClose={onClose}
      footer={
        <>
          {roleId && !locked && (
            // Two presses: the first arms it and turns it red, the second
            // deletes. Quiet until armed, so the way towards the destructive
            // step does not shout as loudly as the step itself.
            <Button
              variant={confirmDelete ? "danger" : "danger-quiet"}
              icon="trash"
              onClick={() =>
                confirmDelete
                  ? remove.mutate({ id: roleId })
                  : setConfirmDelete(true)
              }
              disabled={busy}
              className="sm:mr-auto"
            >
              {confirmDelete ? "Confirm delete" : "Delete role"}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {locked ? "Close" : "Cancel"}
          </Button>
          {!locked && (
            <Button
              variant="primary"
              disabled={busy || !name.trim()}
              onClick={() =>
                roleId
                  ? update.mutate({
                      id: roleId,
                      name,
                      description,
                      permissions,
                    })
                  : create.mutate({ name, description, permissions })
              }
            >
              {roleId ? "Save role" : "Create role"}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}

        {locked && (
          <Callout tone="info">
            This is a built-in role. Its name and permissions are fixed; create
            a custom role if you need a different set.
          </Callout>
        )}

        {/* The field primitive draws a disabled field on the paper with muted
            ink, so a built-in role's name no longer looks typeable. Phones get
            16px type from the global `pointer: coarse` rule, so Safari does
            not zoom the dialog half off screen on focus. */}
        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={locked}
              placeholder="e.g. Lab technician"
            />
          )}
        </Field>

        <Field label="Description">
          {(id) => (
            <Input
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={locked}
              placeholder="What is this role for?"
            />
          )}
        </Field>

        <section aria-labelledby="role-permissions" className="mt-1">
          <h3
            id="role-permissions"
            className="text-title mb-3 text-sm font-semibold"
          >
            Permissions
          </h3>
          <PermissionEditor
            value={permissions}
            onChange={setPermissions}
            disabled={locked}
          />
        </section>
      </div>
    </Dialog>
  );
}
