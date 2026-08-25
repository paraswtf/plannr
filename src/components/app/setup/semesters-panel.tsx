"use client";

import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { DatePicker } from "~/components/ui/date-picker";
import { Dialog } from "~/components/ui/dialog";
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
        <button
          type="button"
          onClick={() => setOpening(true)}
          className="inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-lg px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-white lg:min-h-0"
          style={{ background: "var(--grad-brand)" }}
        >
          Open a semester
        </button>
      }
    >
      {semesters.length === 0 ? (
        <p className="text-muted m-0 text-[14px]">
          No semester yet. Everything in the app is dated against one, so this
          is the first thing to set up.
        </p>
      ) : (
        <div className="flex flex-col">
          {semesters.map((semester, i) => (
            <button
              key={semester.id}
              type="button"
              onClick={() => setEditing(semester)}
              className="flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-1 py-3 text-left"
              style={
                i === 0
                  ? undefined
                  : { boxShadow: "inset 0 1px 0 var(--hair-soft)" }
              }
            >
              <span className="text-title text-[14px] font-semibold">
                {semester.name}
              </span>
              {semester.current && (
                <Badge tone="green" dot>
                  Running now
                </Badge>
              )}
              <span className="text-muted font-mono text-[12px]">
                {formatFullDate(semester.startDate, DEFAULT_TIMEZONE)} –{" "}
                {formatFullDate(semester.endDate, DEFAULT_TIMEZONE)}
              </span>
              {/* On a phone the name, the dates and this tally each take a line
                  of their own, and a lone right-aligned line reads as a stray;
                  it is only flung to the far end once it shares one. */}
              <span className="text-faint font-mono text-[11.5px] sm:ml-auto">
                {semester._count.batches} intakes · {semester._count.courses}{" "}
                courses · {semester._count.groups} groups
              </span>
            </button>
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
          <button
            type="button"
            onClick={onClose}
            className="text-muted inline-flex min-h-10 cursor-pointer items-center rounded-lg px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || create.isPending}
            onClick={() =>
              create.mutate({
                name: name.trim(),
                startDate,
                endDate,
                carryFrom: carry && carryFrom ? carryFrom.id : undefined,
              })
            }
            className="inline-flex min-h-10 items-center rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
            style={{
              background: "var(--grad-brand)",
              opacity: valid && !create.isPending ? 1 : 0.5,
              cursor: valid && !create.isPending ? "pointer" : "not-allowed",
            }}
          >
            {create.isPending ? "Opening…" : "Open semester"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Spring 2027"
            // 16px on a phone: below that, Safari zooms the page in as the
            // field takes focus, which on a dialog leaves it half off screen.
            className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Field>

        {/* The month grid this pops open is 268px wide, which is more than half
            a phone: side by side the two fields would each open a calendar that
            hangs off the dialog. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              timeZone={DEFAULT_TIMEZONE}
            />
          </Field>
          <Field label="Ends">
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              timeZone={DEFAULT_TIMEZONE}
            />
          </Field>
        </div>

        {carryFrom && (
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={carry}
              onChange={(e) => setCarry(e.target.checked)}
              className="mt-1"
            />
            <span className="text-[13px]">
              <span className="text-title font-semibold">
                Carry the intakes forward from {carryFrom.name}
              </span>
              <span className="text-muted mt-0.5 block">
                Each intake arrives one semester further on — a year in its
                seventh becomes its eighth. One in its final semester has
                finished the degree and is left behind.
              </span>
            </span>
          </label>
        )}

        {create.error && (
          <p
            className="m-0 text-[13px] font-semibold"
            style={{ color: "var(--red)" }}
          >
            {create.error.message}
          </p>
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
          {/* Offered only while it is empty; the server refuses either way. */}
          {held === 0 && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: semester.id })}
              className="mr-auto inline-flex min-h-10 cursor-pointer items-center rounded-lg px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
              style={{ color: "var(--red)", boxShadow: "var(--ring)" }}
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-muted inline-flex min-h-10 cursor-pointer items-center rounded-lg px-3.5 py-2 text-[13px] font-semibold lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || update.isPending}
            onClick={() =>
              update.mutate({
                id: semester.id,
                name: name.trim(),
                startDate,
                endDate,
              })
            }
            className="inline-flex min-h-10 items-center rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white lg:min-h-0"
            style={{
              background: "var(--grad-brand)",
              opacity: valid && !update.isPending ? 1 : 0.5,
              cursor: valid && !update.isPending ? "pointer" : "not-allowed",
            }}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            // 16px on a phone: below that, Safari zooms the page in as the
            // field takes focus, which on a dialog leaves it half off screen.
            className="bg-surface min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Field>

        {/* The month grid this pops open is 268px wide, which is more than half
            a phone: side by side the two fields would each open a calendar that
            hangs off the dialog. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Starts">
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              timeZone={DEFAULT_TIMEZONE}
            />
          </Field>
          <Field label="Ends">
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              timeZone={DEFAULT_TIMEZONE}
            />
          </Field>
        </div>

        <p className="text-faint m-0 flex items-start gap-2 text-[12.5px]">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          {held === 0
            ? "Nothing is filed under this semester yet, so it can still be removed."
            : `${semester._count.courses} courses, ${semester._count.groups} groups and ${semester._count.events} lectures are filed under it. Moving its dates moves the term they belong to; it does not move any lecture.`}
        </p>

        {error && (
          <p
            className="m-0 text-[13px] font-semibold"
            style={{ color: "var(--red)" }}
          >
            {error.message}
          </p>
        )}
      </div>
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
    <div className="flex flex-col gap-1.5">
      <span className="text-muted text-[12.5px] font-semibold">{label}</span>
      {children}
    </div>
  );
}
