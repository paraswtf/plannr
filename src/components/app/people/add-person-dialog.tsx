"use client";

import { useEffect, useState } from "react";

import { Dialog } from "~/components/ui/dialog";
import { EntityPicker, useDebounced } from "~/components/ui/entity-picker";
import { roleCard } from "./entity-cards";
import { api } from "~/trpc/react";

/** Adds one person. Bulk arrivals go through the CSV import instead. */
export function AddPersonDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<unknown>;
}) {
  const roles = api.roles.list.useQuery();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [prn, setPrn] = useState("");
  const [department, setDepartment] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [roleQuery, setRoleQuery] = useState("");
  const [defaulted, setDefaulted] = useState(false);

  // Default to the student role once the list arrives. In an effect rather
  // than during render, which would be a state update in the render phase.
  useEffect(() => {
    if (defaulted || !roles.data) return;
    const student = roles.data.find((r) => r.key === "student");
    if (student) setRoleIds([student.id]);
    setDefaulted(true);
  }, [roles.data, defaulted]);

  const debouncedRole = useDebounced(roleQuery);
  const roleRows = (roles.data ?? []).filter((r) =>
    debouncedRole
      ? r.name.toLowerCase().includes(debouncedRole.toLowerCase())
      : true,
  );

  const create = api.users.create.useMutation({
    onSuccess: async () => {
      await onCreated();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const isFaculty = (roles.data ?? [])
    .filter((r) => roleIds.includes(r.id))
    .some((r) => r.key === "faculty" || r.key === "coordinator");
  const ready = name.trim() && email.trim() && roleIds.length > 0;

  return (
    <Dialog
      open
      title="Add a person"
      icon="users"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="text-muted min-h-10 cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
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
                email,
                roleIds,
                prn: prn.trim() || undefined,
                department: department.trim() || undefined,
              })
            }
            className="min-h-10 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
            style={{
              background: "var(--grad-brand)",
              opacity: ready && !create.isPending ? 1 : 0.5,
              cursor: ready && !create.isPending ? "pointer" : "not-allowed",
            }}
          >
            {create.isPending ? "Adding…" : "Add person"}
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

        <Labelled label="Full name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Riya Kapoor"
            // 16px on a phone: below that, Safari zooms the page in as the
            // field takes focus, which on a dialog leaves it half off screen.
            className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Labelled>

        <Labelled label="Email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@college.edu"
            className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Labelled>

        <Labelled
          label="PRN"
          hint="Students only — needed for group membership."
        >
          <input
            value={prn}
            onChange={(e) => setPrn(e.target.value)}
            placeholder="11 digits"
            className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 font-mono text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Labelled>

        {isFaculty && (
          <Labelled label="Department">
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Computer Science"
              className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
              style={{ boxShadow: "var(--ring)" }}
            />
          </Labelled>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">Roles</span>
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
            placeholder="Search roles…"
            emptyLabel="No roles"
            listId="add-person-roles"
          />
        </div>
      </div>
    </Dialog>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">
        {label}
        {hint && (
          <span className="text-faint ml-2 text-[11.5px] font-medium">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
