"use client";

import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { DatePicker } from "~/components/ui/date-picker";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Checkbox } from "~/components/ui/checkbox";
import { Field, Input } from "~/components/ui/field";
import { Icon } from "~/components/ui/icon";
import { DEFAULT_TIMEZONE, formatFullDate } from "~/lib/dates";
import { api, type RouterOutputs } from "~/trpc/react";

/**
 * The semesters the college has kept, and the way the next one is opened.
 *
 * Rollover is why this panel exists. Everything dated — courses, groups,
 * lectures, registers — belongs to a semester, so with no way to open the next
 * one from inside the app the only way to start a term would be to edit the
 * current one, and each previous term would be overwritten as it went.
 */

type Semesters = RouterOutputs["semesters"]["list"];
type Semester = Semesters["rows"][number];

/** Local midnight today, which is what the date picker deals in. */
function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function SemestersPanel({ initial }: { initial: Semesters }) {
  const utils = api.useUtils();
  const list = api.semesters.list.useQuery(undefined, { initialData: initial });
  const [editing, setEditing] = useState<Semester | null>(null);
  const [opening, setOpening] = useState(false);

  const semesters = list.data?.rows ?? [];
  const refresh = () => {
    void utils.semesters.list.invalidate();
    void utils.courses.structure.invalidate();
    setEditing(null);
    setOpening(false);
  };

  return (
    <Card
      title="Semesters"
      action={
        // The one primary on Setup: opening the next term is the thing this
        // page exists to let someone do.
        <Button
          variant="primary"
          size="sm"
          icon="plus"
          onClick={() => setOpening(true)}
        >
          Open a semester
        </Button>
      }
    >
      {semesters.length === 0 ? (
        <EmptyState compact icon="calendar" title="No semester yet">
          Everything in the app is dated against one, so this is the first thing
          to set up.
        </EmptyState>
      ) : (
        <div className="-mx-2 flex flex-col">
          {semesters.map((semester, i) => (
            <div key={semester.id}>
              {/* The hairline is its own element rather than an edge of the
                  row, so a hovered row's rounded wash does not bend it. */}
              {i > 0 && (
                <span aria-hidden className="bg-hair-soft mx-2 block h-px" />
              )}
              <button
                type="button"
                onClick={() => setEditing(semester)}
                // Each row opens the semester for editing, so it answers the
                // pointer like any other row that does something, and ends in
                // the arrow every such row in the app ends in.
                className="plr-clip hover:bg-tint-hover flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-[10px] px-2 py-3 text-left"
              >
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-title text-base font-semibold">
                    {semester.name}
                  </span>
                  {semester.current && (
                    <Badge tone="green" dot>
                      Running now
                    </Badge>
                  )}
                  <span className="text-muted font-mono text-xs">
                    {formatFullDate(semester.startDate, DEFAULT_TIMEZONE)} -{" "}
                    {formatFullDate(semester.endDate, DEFAULT_TIMEZONE)}
                  </span>
                  {/* On a phone the name, the dates and this tally each take a
                      line of their own, and a lone right-aligned line reads as
                      a stray; it is only flung to the far end once it shares
                      one. */}
                  <span className="text-faint font-mono text-xs tabular-nums sm:ml-auto">
                    {semester._count.batches} intakes, {semester._count.courses}{" "}
                    courses, {semester._count.groups} groups
                  </span>
                </span>
                <Icon
                  name="chevronRight"
                  size={14}
                  color="var(--faint)"
                  className="shrink-0"
                />
              </button>
            </div>
          ))}
        </div>
      )}

      {opening && (
        <OpenSemester
          carryFrom={semesters[0]}
          onClose={() => setOpening(false)}
          onDone={refresh}
        />
      )}
      {editing && (
        <EditSemester
          semester={editing}
          onClose={() => setEditing(null)}
          onDone={refresh}
        />
      )}
    </Card>
  );
}

/**
 * Opening the next one.
 *
 * The dates are typed rather than guessed: an academic calendar is not a fixed
 * distance from the last one in any way this app could work out, and a wrong
 * date silently mis-files every lecture scheduled into it.
 */
function OpenSemester({
  carryFrom,
  onClose,
  onDone,
}: {
  carryFrom: Semester | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [carry, setCarry] = useState(true);

  const create = api.semesters.create.useMutation({ onSuccess: onDone });
  const valid = name.trim().length > 0 && endDate > startDate;

  return (
    <Dialog
      open
      icon="calendar"
      title="Open a semester"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid || create.isPending}
            onClick={() =>
              create.mutate({
                name: name.trim(),
                startDate,
                endDate,
                carryFrom: carry && carryFrom ? carryFrom.id : undefined,
              })
            }
          >
            {create.isPending ? "Opening…" : "Open semester"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {create.error && (
          <Callout tone="bad" role="alert">
            {create.error.message}
          </Callout>
        )}

        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring 2027"
            />
          )}
        </Field>

        <DateFields
          startDate={startDate}
          endDate={endDate}
          onStart={setStartDate}
          onEnd={setEndDate}
        />

        {carryFrom && (
          // The whole box is the checkbox's label, so the explanation is part
          // of the target rather than small print beside the tick.
          <Checkbox
            checked={carry}
            onChange={setCarry}
            label={`Carry the intakes forward from ${carryFrom.name}`}
            description="Each intake arrives one semester further on: a year in its seventh becomes its eighth. One in its final semester has finished the degree and is left behind."
            className="hover:bg-tint-hover gap-3 rounded-[12px] px-3.5 !py-3 shadow-[inset_0_0_0_1px_var(--hair)] transition-colors"
          />
        )}
      </div>
    </Dialog>
  );
}

/** Renaming one, moving its dates, or removing one opened by mistake. */
function EditSemester({
  semester,
  onClose,
  onDone,
}: {
  semester: Semester;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(semester.name);
  const [startDate, setStartDate] = useState(semester.startDate);
  const [endDate, setEndDate] = useState(semester.endDate);

  const update = api.semesters.update.useMutation({ onSuccess: onDone });
  const remove = api.semesters.remove.useMutation({ onSuccess: onDone });
  const held =
    semester._count.courses + semester._count.groups + semester._count.events;
  const valid = name.trim().length > 0 && endDate > startDate;
  const error = update.error ?? remove.error;

  return (
    <Dialog
      open
      icon="calendar"
      title={semester.name}
      onClose={onClose}
      footer={
        <>
          {/* Offered only while it is empty; the server refuses either way.
              Removing is final the moment it is pressed, so it wears the
              filled red, kept apart from the save on the dialog's other end. */}
          {held === 0 && (
            <Button
              variant="danger"
              className="sm:mr-auto"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: semester.id })}
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid || update.isPending}
            onClick={() =>
              update.mutate({
                id: semester.id,
                name: name.trim(),
                startDate,
                endDate,
              })
            }
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Callout tone="bad" role="alert">
            {error.message}
          </Callout>
        )}

        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>

        <DateFields
          startDate={startDate}
          endDate={endDate}
          onStart={setStartDate}
          onEnd={setEndDate}
        />

        <Callout tone="neutral">
          {held === 0
            ? "Nothing is filed under this semester yet, so it can still be removed."
            : `${semester._count.courses} courses, ${semester._count.groups} groups and ${semester._count.events} lectures are filed under it. Moving its dates moves the term they belong to; it does not move any lecture.`}
        </Callout>
      </div>
    </Dialog>
  );
}

/** The two dates, as both dialogs ask for them. */
function DateFields({
  startDate,
  endDate,
  onStart,
  onEnd,
}: {
  startDate: Date;
  endDate: Date;
  onStart: (day: Date) => void;
  onEnd: (day: Date) => void;
}) {
  return (
    // The month grid this pops open is 268px wide, which is more than half a
    // phone: side by side the two fields would each open a calendar that hangs
    // off the dialog.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
      <Field label="Starts">
        {(id) => (
          <DatePicker
            id={id}
            value={startDate}
            onChange={onStart}
            timeZone={DEFAULT_TIMEZONE}
          />
        )}
      </Field>
      <Field label="Ends">
        {(id) => (
          <DatePicker
            id={id}
            value={endDate}
            onChange={onEnd}
            timeZone={DEFAULT_TIMEZONE}
          />
        )}
      </Field>
    </div>
  );
}
