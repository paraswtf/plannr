"use client";

import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Dialog } from "~/components/ui/dialog";
import { Field, Input } from "~/components/ui/field";
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
    const student = roles.data.rows.find((r) => r.key === "student");
    if (student) setRoleIds([student.id]);
    setDefaulted(true);
  }, [roles.data, defaulted]);

  const debouncedRole = useDebounced(roleQuery);
  const roleRows = (roles.data?.rows ?? []).filter((r) =>
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

  const isFaculty = (roles.data?.rows ?? [])
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
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
          >
            {create.isPending ? "Adding…" : "Add person"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}

        {/* Phones get 16px type from the global `pointer: coarse` rule:
            below that, Safari zooms the page in as the field takes focus,
            which on a dialog leaves it half off screen. */}
        <Field label="Full name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Riya Kapoor"
            />
          )}
        </Field>

        <Field label="Email">
          {(id) => (
            <Input
              id={id}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@college.edu"
            />
          )}
        </Field>

        <Field label="PRN" hint="Students only, needed for group membership.">
          {(id) => (
            <Input
              id={id}
              value={prn}
              onChange={(e) => setPrn(e.target.value)}
              placeholder="11 digits"
              className="font-mono"
            />
          )}
        </Field>

        {isFaculty && (
          <Field label="Department">
            {(id) => (
              <Input
                id={id}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Computer Science"
              />
            )}
          </Field>
        )}

        <Field label="Roles">
          {(id) => (
            <EntityPicker
              id={id}
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
              placeholder="Search roles…"
              emptyLabel="No roles"
              listId="add-person-roles"
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
