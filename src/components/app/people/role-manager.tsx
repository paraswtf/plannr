"use client";

import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import {
  PermissionBitField,
  PERMISSION_CATALOG,
  PermissionFlags,
} from "~/lib/permissions";
import { api } from "~/trpc/react";
import { PermissionEditor } from "./permission-editor";

/** Lists roles and edits the custom ones. The four built-ins are read-only. */
export function RoleManager({ canManage }: { canManage: boolean }) {
  const utils = api.useUtils();
  const roles = api.roles.list.useQuery();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted max-w-2xl text-[13px]">
          Roles bundle permissions. The four built-in roles are locked so their
          meaning is the same everywhere; create a custom role for anything
          specific to your institution.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-10 shrink-0 cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
            style={{ background: "var(--grad-brand)" }}
          >
            + New role
          </button>
        )}
      </div>

      {/*
       * auto-fill lays a 300px track even when the screen cannot hold one, so
       * the single column is asked for explicitly below sm rather than left to
       * the track sizing to work out.
       */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {(roles.data?.rows ?? []).map((role) => {
          const bits = new PermissionBitField(BigInt(role.permissions));
          const held = PERMISSION_CATALOG.filter((p) =>
            bits.has(PermissionFlags[p.name]),
          );
          return (
            <Card key={role.id} pad={18} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                {/* Role names are typed by whoever creates the role, so the
                    column has to be allowed to give way rather than push the
                    card wider than the screen. */}
                <div className="min-w-0">
                  <div className="font-display text-title text-[16px] font-bold">
                    {role.name}
                  </div>
                  {role.description && (
                    <div className="text-muted mt-0.5 text-[12.5px]">
                      {role.description}
                    </div>
                  )}
                </div>
                {role.isSystem ? (
                  <Badge tone="neutral">built-in</Badge>
                ) : (
                  <Badge tone="slate">custom</Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {bits.has(PermissionFlags.Administrator) ? (
                  <Badge tone="red">Full access</Badge>
                ) : (
                  <>
                    {held.slice(0, 4).map((p) => (
                      <span
                        key={p.name}
                        className="text-muted rounded-md px-2 py-1 text-[11px] font-semibold"
                        style={{ background: "rgba(68,88,121,0.07)" }}
                      >
                        {p.label}
                      </span>
                    ))}
                    {held.length > 4 && (
                      <span className="text-faint px-1 py-1 text-[11px]">
                        +{held.length - 4} more
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="text-faint font-mono text-[11.5px]">
                  {role.userCount} {role.userCount === 1 ? "person" : "people"}
                </span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setEditing(role.id)}
                    className="text-slate inline-flex min-h-10 cursor-pointer items-center text-[12.5px] font-bold lg:min-h-0"
                  >
                    {role.isSystem ? "View →" : "Edit →"}
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

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
            <button
              type="button"
              onClick={() =>
                confirmDelete
                  ? remove.mutate({ id: roleId })
                  : setConfirmDelete(true)
              }
              disabled={busy}
              className="mr-auto inline-flex min-h-10 cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-[#b02636] lg:min-h-0"
            >
              <Icon name="trash" size={13} color="var(--red)" />
              {confirmDelete ? "Confirm delete" : "Delete role"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-muted min-h-10 cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          >
            {locked ? "Close" : "Cancel"}
          </button>
          {!locked && (
            <button
              type="button"
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
              className="min-h-10 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
              style={{
                background: "var(--grad-brand)",
                opacity: busy || !name.trim() ? 0.5 : 1,
                cursor: busy || !name.trim() ? "not-allowed" : "pointer",
              }}
            >
              {roleId ? "Save role" : "Create role"}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
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

        {locked && (
          <div
            className="text-ink rounded-xl p-3 text-[12.5px]"
            style={{
              background: "rgba(246,167,59,0.10)",
              boxShadow: "inset 0 0 0 1px rgba(246,167,59,0.35)",
            }}
          >
            This is a built-in role. Its name and permissions are fixed — create
            a custom role if you need a different set.
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={locked}
            placeholder="e.g. Lab technician"
            // 16px on a phone: below that, Safari zooms the page in as the
            // field takes focus, which on a dialog leaves it half off screen.
            className="bg-surface min-h-10 rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">
            Description
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={locked}
            placeholder="What is this role for?"
            className="bg-surface min-h-10 rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </label>

        <div>
          <div className="text-ink mb-2 text-[13px] font-semibold">
            Permissions
          </div>
          <PermissionEditor
            value={permissions}
            onChange={setPermissions}
            disabled={locked}
          />
        </div>
      </div>
    </Dialog>
  );
}
