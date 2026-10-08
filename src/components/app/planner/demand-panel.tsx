"use client";

import { useState } from "react";

import { FEATURE_LABELS } from "~/components/app/booking/room-fit";
import { Badge } from "~/components/ui/badge";
import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { formatDuration } from "~/lib/dates";
import { ROOM_TYPE_LABEL } from "~/lib/schedule-plan";
import { api } from "~/trpc/react";
import { DemandImportDialog } from "./demand-import-dialog";
import { RequirementDialog } from "./requirement-dialog";

import type { RouterOutputs } from "~/trpc/react";

type Plan = RouterOutputs["plans"]["byId"];
type Requirement = Plan["requirements"][number];

/**
 * The demand table: one line per subject a group needs, which is how a
 * department hands its teaching load over. Either typed in here or pasted in
 * from their spreadsheet — the two produce identical rows, so nothing is
 * second-class about the imported ones.
 */
export function DemandPanel({
  plan,
  onChanged,
}: {
  plan: Plan;
  onChanged: () => void | Promise<unknown>;
}) {
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = api.plans.removeRequirement.useMutation({
    onSuccess: () => onChanged(),
    onError: (e) => setError(e.message),
  });

  const totalSessions = plan.requirements.reduce(
    (sum, r) => sum + r.sessionsPerWeek,
    0,
  );
  const totalHours = plan.requirements.reduce(
    (sum, r) => sum + (r.sessionsPerWeek * r.durationMinutes) / 60,
    0,
  );
  const groups = new Set(plan.requirements.map((r) => r.groupId)).size;

  const empty = plan.requirements.length === 0;
  const startRemove = (requirement: Requirement) => {
    setError(null);
    remove.mutate({ id: requirement.id });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* The toolbar's two ways in are left out while the plan is empty: the
          empty state below offers the same two, larger, and a second pair
          above it only made the first screen of a new plan say everything
          twice. */}
      {!empty && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted text-sm tabular-nums">
            <span className="text-title font-semibold">{totalSessions}</span>{" "}
            lectures a week across{" "}
            <span className="text-title font-semibold">{groups}</span>{" "}
            {groups === 1 ? "group" : "groups"} ·{" "}
            {Math.round(totalHours * 10) / 10} contact hours
          </span>
          {plan.can.edit && (
            <span className="flex w-full items-center gap-2.5 sm:ml-auto sm:w-auto">
              {/* Neither is filled: the header already carries the stage's one
                  primary (generate, or share), and this pair adds to the
                  demand rather than moving the plan on. */}
              <Button
                icon="upload"
                onClick={() => setImporting(true)}
                className="flex-1 sm:flex-none"
              >
                Upload CSV
              </Button>
              <Button
                icon="plus"
                onClick={() => setAdding(true)}
                className="flex-1 sm:flex-none"
              >
                Add a subject
              </Button>
            </span>
          )}
        </div>
      )}

      {error && (
        <Callout tone="bad" role="alert">
          {error}
        </Callout>
      )}

      {empty ? (
        <Card pad={0}>
          {plan.can.edit ? (
            <EmptyState
              icon="layers"
              title="Nothing to schedule yet"
              action={
                <div className="flex flex-wrap justify-center gap-2.5">
                  <Button icon="upload" onClick={() => setImporting(true)}>
                    Upload CSV
                  </Button>
                  <Button
                    variant="primary"
                    icon="plus"
                    onClick={() => setAdding(true)}
                  >
                    Add a subject
                  </Button>
                </div>
              }
            >
              Add the subjects each group needs, or upload the department&apos;s
              spreadsheet.
            </EmptyState>
          ) : (
            <EmptyState
              icon="layers"
              title="This plan has no demand recorded"
            />
          )}
        </Card>
      ) : (
        <>
          {/* Seven columns of demand is a matrix on a desk and unreadable on a
              phone, and each row here is really one record rather than a cell
              in a grid — so below `md` a requirement is stacked as its own
              record, and the table proper starts where it has room to be a
              table. The records share one panel, divided by hairlines, rather
              than each being a card of its own: eleven raised boxes in a row
              were eleven times the chrome for the same words. */}
          <ul className="bg-surface rounded-[var(--radius-card)] shadow-[var(--ring),var(--shadow-card)] md:hidden">
            {plan.requirements.map((requirement) => (
              <li
                key={requirement.id}
                className="px-4 py-3.5 shadow-[inset_0_-1px_0_var(--hair-soft)] last:shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="text-title block text-base font-semibold">
                      {requirement.subject}
                    </span>
                    <span className="text-muted block text-sm">
                      {requirement.groupLabel}
                      {requirement.groupSize > 0 &&
                        ` · ${requirement.groupSize} students`}
                    </span>
                  </span>
                  {plan.can.edit && (
                    <RowActions
                      onEdit={() => setEditing(requirement)}
                      onRemove={() => startRemove(requirement)}
                      className="-mt-1 -mr-2"
                    />
                  )}
                </div>

                <p className="text-ink mt-1.5 mb-0 text-sm tabular-nums">
                  {requirement.sessionsPerWeek} a week,{" "}
                  {formatDuration(requirement.durationMinutes)} each
                  <span className="text-muted">
                    {" "}
                    ·{" "}
                    {requirement.facultyNames.length > 0
                      ? requirement.facultyNames.join(", ")
                      : "Anyone"}
                  </span>
                </p>

                <div className="mt-2">
                  <RoomNeeds requirement={requirement} />
                </div>

                {requirement.notes && (
                  <p className="text-muted mt-2 mb-0 text-xs">
                    {requirement.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="bg-surface plr-scroll hidden overflow-x-auto rounded-[var(--radius-card)] shadow-[var(--ring),var(--shadow-card)] md:block">
            {/* Below this the columns squeeze rather than scroll, and a room
                requirement wrapped over four lines is worse than a sideways
                nudge. */}
            <table className="w-full min-w-[840px] border-collapse">
              <thead>
                <tr>
                  <Th>Group</Th>
                  <Th>Subject</Th>
                  <Th align="right">Per week</Th>
                  <Th>Length</Th>
                  <Th>Taught by</Th>
                  <Th>Room needs</Th>
                  {plan.can.edit && (
                    <Th align="right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {plan.requirements.map((requirement) => (
                  <tr key={requirement.id}>
                    <Td>
                      <span className="text-title font-semibold whitespace-nowrap">
                        {requirement.groupLabel}
                      </span>
                      {requirement.groupSize > 0 && (
                        <span className="text-faint mt-0.5 block text-xs tabular-nums">
                          {requirement.groupSize} students
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-title font-medium">
                        {requirement.subject}
                      </span>
                      {requirement.notes && (
                        <span className="text-muted mt-0.5 block text-xs">
                          {requirement.notes}
                        </span>
                      )}
                    </Td>
                    <Td align="right" mono>
                      {requirement.sessionsPerWeek}
                    </Td>
                    {/* The body face with even figures, not mono: "1 hr 30
                        min" in a monospace read as if it were double-spaced. */}
                    <Td>
                      <span className="whitespace-nowrap tabular-nums">
                        {formatDuration(requirement.durationMinutes)}
                      </span>
                    </Td>
                    <Td>
                      {requirement.facultyNames.length > 0 ? (
                        <span className="text-ink">
                          {requirement.facultyNames.join(", ")}
                        </span>
                      ) : (
                        <span className="text-faint">Anyone</span>
                      )}
                    </Td>
                    <Td>
                      <RoomNeeds requirement={requirement} />
                    </Td>
                    {plan.can.edit && (
                      <Td align="right">
                        <RowActions
                          onEdit={() => setEditing(requirement)}
                          onRemove={() => startRemove(requirement)}
                          className="-my-1.5 justify-end"
                        />
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(adding || editing) && (
        <RequirementDialog
          planId={plan.id}
          slotMinutes={plan.settings.slotMinutes}
          requirement={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={onChanged}
        />
      )}

      {importing && (
        <DemandImportDialog
          planId={plan.id}
          hasExisting={plan.requirements.length > 0}
          onClose={() => setImporting(false)}
          onImported={onChanged}
        />
      )}
    </div>
  );
}

/**
 * What the room has to be, as one kind of chip with the words on it.
 *
 * These were four colours of badge (slate for the kind of room, orange for kit,
 * grey for seats, green with a dot for the preferred room) and nothing said
 * which colour meant what. A requirement is not a state, so none of them earns
 * a state colour; the words do the work, and the preferred room says that it
 * is a preference.
 */
function RoomNeeds({ requirement }: { requirement: Requirement }) {
  const bits: string[] = [];
  if (requirement.roomType) bits.push(ROOM_TYPE_LABEL[requirement.roomType]);
  for (const feature of requirement.requiredFeatures) {
    bits.push(FEATURE_LABELS[feature]);
  }
  if (requirement.minCapacity) bits.push(`${requirement.minCapacity}+ seats`);
  if (requirement.preferredRoomCode) {
    bits.push(`Prefers ${requirement.preferredRoomCode}`);
  }

  if (bits.length === 0) {
    return <span className="text-faint text-sm">Any free room</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {bits.map((bit) => (
        <Badge key={bit}>{bit}</Badge>
      ))}
    </span>
  );
}

/**
 * Edit and Remove for one requirement.
 *
 * The two sit a full gap apart, because Remove deletes at once with no
 * confirmation and the old pair, 28px each and 4px apart, was one slip of a
 * finger from it. Remove stays muted until hovered, so the bin does not shout
 * on every row.
 */
function RowActions({
  onEdit,
  onRemove,
  className = "",
}: {
  onEdit: () => void;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <span className={`flex shrink-0 items-center gap-2 ${className}`}>
      <IconButton icon="pencil" label="Edit" size="sm" onClick={onEdit} />
      <IconButton
        icon="trash"
        label="Remove"
        size="sm"
        variant="danger"
        onClick={onRemove}
      />
    </span>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`text-muted text-2xs px-3 py-2.5 font-semibold whitespace-nowrap shadow-[inset_0_-1px_0_var(--hair)] first:pl-4 last:pr-4 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      className={`text-ink px-3 py-3 align-top text-sm shadow-[inset_0_-1px_0_var(--hair-soft)] first:pl-4 last:pr-4 [tr:last-child>&]:shadow-none ${align === "right" ? "text-right" : "text-left"} ${mono ? "font-mono tabular-nums" : ""}`}
    >
      {children}
    </td>
  );
}
