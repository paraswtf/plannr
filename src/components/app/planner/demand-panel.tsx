"use client";

import { useState } from "react";

import { FEATURE_LABELS } from "~/components/app/booking/room-fit";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted text-[13px]">
          <b className="text-title">{totalSessions}</b> lectures a week across{" "}
          <b className="text-title">{groups}</b>{" "}
          {groups === 1 ? "group" : "groups"} ·{" "}
          {Math.round(totalHours * 10) / 10} contact hours
        </span>
        {plan.can.edit && (
          <span className="flex w-full items-center gap-2.5 sm:ml-auto sm:w-auto">
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold sm:flex-none lg:min-h-0 lg:py-2"
              style={{ boxShadow: "var(--ring)" }}
            >
              <Icon name="upload" size={15} color="var(--slate)" />
              Upload CSV
            </button>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-[var(--radius-btn)] px-3.5 text-[13px] font-semibold text-white sm:flex-none lg:min-h-0 lg:py-2"
              style={{ background: "var(--slate)" }}
            >
              + Add a subject
            </button>
          </span>
        )}
      </div>

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

      {plan.requirements.length === 0 ? (
        <Card>
          <p className="text-muted m-0 text-[14px]">
            {plan.can.edit
              ? "Nothing to schedule yet. Add the subjects each group needs, or upload the department's spreadsheet."
              : "This plan has no demand recorded."}
          </p>
        </Card>
      ) : (
        <>
          {/* Seven columns of demand is a matrix on a desk and unreadable on a
              phone, and each row here is really one record rather than a cell
              in a grid — so below `md` a requirement is stacked as its own
              card, and the table proper starts where it has room to be a
              table. */}
          <div className="flex flex-col gap-2.5 md:hidden">
            {plan.requirements.map((requirement) => (
              <div
                key={requirement.id}
                className="bg-surface rounded-[var(--radius-card)] p-3.5"
                style={{ boxShadow: "var(--ring), var(--shadow-card)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="text-title block text-[13.5px] font-semibold">
                      {requirement.subject}
                    </span>
                    <span className="text-muted block text-[12px]">
                      {requirement.groupLabel}
                      {requirement.groupSize > 0 &&
                        ` · ${requirement.groupSize} students`}
                    </span>
                  </span>
                  {plan.can.edit && (
                    <span className="flex shrink-0 items-center gap-1">
                      <IconButton
                        label="Edit"
                        icon="swap"
                        onClick={() => setEditing(requirement)}
                      />
                      <IconButton
                        label="Remove"
                        icon="trash"
                        tone="var(--red)"
                        onClick={() => {
                          setError(null);
                          remove.mutate({ id: requirement.id });
                        }}
                      />
                    </span>
                  )}
                </div>

                <p className="text-muted mt-2 mb-0 text-[12px]">
                  <span className="font-mono">
                    {requirement.sessionsPerWeek}
                  </span>{" "}
                  a week ·{" "}
                  <span className="font-mono">
                    {formatDuration(requirement.durationMinutes)}
                  </span>{" "}
                  ·{" "}
                  {requirement.facultyNames.length > 0
                    ? requirement.facultyNames.join(", ")
                    : "Anyone"}
                </p>

                <div className="mt-2">
                  <RoomNeeds requirement={requirement} />
                </div>

                {requirement.notes && (
                  <p className="text-faint mt-2 mb-0 text-[11.5px]">
                    {requirement.notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div
            className="bg-surface plr-scroll hidden overflow-x-auto rounded-[var(--radius-card)] md:block"
            style={{ boxShadow: "var(--ring), var(--shadow-card)" }}
          >
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
                  {plan.can.edit && <Th align="right">{""}</Th>}
                </tr>
              </thead>
              <tbody>
                {plan.requirements.map((requirement) => (
                  <tr key={requirement.id}>
                    <Td>
                      <span className="text-title font-semibold">
                        {requirement.groupLabel}
                      </span>
                      {requirement.groupSize > 0 && (
                        <span className="text-faint mt-0.5 block font-mono text-[11px]">
                          {requirement.groupSize} students
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-title font-medium">
                        {requirement.subject}
                      </span>
                      {requirement.notes && (
                        <span className="text-faint mt-0.5 block text-[11.5px]">
                          {requirement.notes}
                        </span>
                      )}
                    </Td>
                    <Td align="right" mono>
                      {requirement.sessionsPerWeek}
                    </Td>
                    <Td mono>{formatDuration(requirement.durationMinutes)}</Td>
                    <Td>
                      {requirement.facultyNames.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {requirement.facultyNames.map((name, i) => (
                            <span
                              key={`${requirement.id}-${i}`}
                              className="text-muted text-[12px]"
                            >
                              {name}
                              {i < requirement.facultyNames.length - 1
                                ? ","
                                : ""}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-faint text-[12px]">Anyone</span>
                      )}
                    </Td>
                    <Td>
                      <RoomNeeds requirement={requirement} />
                    </Td>
                    {plan.can.edit && (
                      <Td align="right">
                        <span className="flex items-center justify-end gap-1">
                          <IconButton
                            label="Edit"
                            icon="swap"
                            onClick={() => setEditing(requirement)}
                          />
                          <IconButton
                            label="Remove"
                            icon="trash"
                            tone="var(--red)"
                            onClick={() => {
                              setError(null);
                              remove.mutate({ id: requirement.id });
                            }}
                          />
                        </span>
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

function RoomNeeds({ requirement }: { requirement: Requirement }) {
  const bits: React.ReactNode[] = [];
  if (requirement.roomType) {
    bits.push(
      <Badge key="type" tone="slate">
        {ROOM_TYPE_LABEL[requirement.roomType]}
      </Badge>,
    );
  }
  for (const feature of requirement.requiredFeatures) {
    bits.push(
      <Badge key={feature} tone="orange">
        {FEATURE_LABELS[feature]}
      </Badge>,
    );
  }
  if (requirement.minCapacity) {
    bits.push(
      <Badge key="cap" tone="neutral">
        {requirement.minCapacity}+ seats
      </Badge>,
    );
  }
  if (requirement.preferredRoomCode) {
    bits.push(
      <Badge key="room" tone="green" dot>
        {requirement.preferredRoomCode}
      </Badge>,
    );
  }

  if (bits.length === 0) {
    return <span className="text-faint text-[12px]">Any free room</span>;
  }
  return <span className="flex flex-wrap gap-1">{bits}</span>;
}

function IconButton({
  label,
  icon,
  onClick,
  tone = "var(--muted)",
}: {
  label: string;
  icon: "swap" | "trash";
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg lg:h-7 lg:w-7"
      style={{ boxShadow: "var(--ring)" }}
    >
      <Icon name={icon} size={13} color={tone} />
    </button>
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
      className="text-muted px-3 py-2.5 text-[11px] font-bold tracking-wider uppercase"
      style={{
        textAlign: align,
        boxShadow: "inset 0 -1px 0 var(--hair)",
      }}
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
      className={`text-ink px-3 py-2.5 align-top text-[12.5px] ${mono ? "font-mono" : ""}`}
      style={{ textAlign: align, boxShadow: "inset 0 -1px 0 var(--hair-soft)" }}
    >
      {children}
    </td>
  );
}
