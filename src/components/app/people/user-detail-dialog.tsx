"use client";

import { useEffect, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
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
  const roles = api.roles.list.useQuery();

  const [name, setName] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [extra, setExtra] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!user.data) return;
    setName(user.data.name ?? "");
    setRoleIds(user.data.roles.map((r) => r.id));
    setExtra(user.data.extraPermissions);
  }, [user.data]);

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
    remove.isPending;

  const rolesChanged =
    data &&
    (roleIds.length !== data.roles.length ||
      roleIds.some((id) => !data.roles.some((r) => r.id === id)));

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
                className="bg-surface w-full rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
                style={{ boxShadow: "var(--ring)" }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email">
                <div className="text-muted px-1 py-2 text-[13px]">
                  {data.email}
                </div>
              </Field>
              <Field label="PRN">
                <div className="text-muted px-1 py-2 font-mono text-[13px]">
                  {data.prn ?? "—"}
                </div>
              </Field>
            </div>
            <div className="flex items-center gap-2">
              {data.hasSignedIn ? (
                <Badge tone="green" dot>
                  has signed in
                </Badge>
              ) : (
                <Badge tone="neutral">imported, never signed in</Badge>
              )}
              {!data.isActive && <Badge tone="red">disabled</Badge>}
            </div>
          </div>

          <div>
            <SectionTitle>Roles</SectionTitle>
            <p className="text-muted mb-2.5 text-[12.5px]">
              Someone can hold several at once — a lecturer who also coordinates
              gets both sets of permissions.
            </p>
            <div className="flex flex-wrap gap-2">
              {(roles.data ?? []).map((r) => {
                const on = roleIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!canManage}
                    onClick={() =>
                      setRoleIds((prev) =>
                        prev.includes(r.id)
                          ? prev.filter((x) => x !== r.id)
                          : [...prev, r.id],
                      )
                    }
                    className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold"
                    style={{
                      background: on ? "var(--slate)" : "var(--surface)",
                      color: on ? "#fff" : "var(--muted)",
                      boxShadow: on ? "none" : "var(--ring)",
                      cursor: canManage ? "pointer" : "default",
                    }}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
            {canManage && rolesChanged && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setRoles.mutate({ id: userId, roleIds })}
                className="mt-3 cursor-pointer rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold text-white"
                style={{ background: "var(--slate)" }}
              >
                Save roles
              </button>
            )}
          </div>

          {canManageRoles && (
            <details>
              <summary className="text-title cursor-pointer text-[13.5px] font-semibold">
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
                  className="mt-3 cursor-pointer rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold text-white"
                  style={{ background: "var(--slate)" }}
                >
                  Save permissions
                </button>
              )}
            </details>
          )}

          <div
            className="flex items-center justify-between gap-3 pt-4"
            style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
          >
            {canManage ? (
              confirmDelete ? (
                <span className="flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-[#b02636]">
                    Remove {data.name ?? data.email}?
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove.mutate({ id: userId })}
                    className="cursor-pointer rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold text-white"
                    style={{ background: "var(--red)" }}
                  >
                    Yes, remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-muted cursor-pointer text-[12.5px]"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-[#b02636]"
                >
                  <Icon name="trash" size={13} color="var(--red)" />
                  Remove person
                </button>
              )
            ) : (
              <span />
            )}

            <span className="flex gap-2">
              {canManage && name !== (data.name ?? "") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => update.mutate({ id: userId, name })}
                  className="cursor-pointer rounded-[8px] px-3.5 py-2 text-[13px] font-semibold text-white"
                  style={{ background: "var(--slate)" }}
                >
                  Save name
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-muted cursor-pointer rounded-[8px] px-3.5 py-2 text-[13px] font-semibold"
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
