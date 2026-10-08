"use client";

import { useMemo, useState } from "react";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge, type BadgeTone } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout, type CalloutTone } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Field, Input } from "~/components/ui/field";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { api, type RouterOutputs } from "~/trpc/react";

type Queue = RouterOutputs["events"]["approvalQueue"];
type Item = Queue["rows"][number];

const TZ = "Asia/Kolkata";

const day = (start: Date) =>
  start.toLocaleString("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/*
 * The 24-hour clock stays, though the rest of the app says "9:30am": the
 * clash messages under an open request are written by the server in 24-hour
 * time, and a slot quoted as "2pm" over a clash quoted as "14:30" would make
 * the reader convert between the two to see the overlap.
 */
const clock = (at: Date) =>
  at.toLocaleString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });

/** A slot's hours, with a plain hyphen for the range. */
const hours = (start: Date, end: Date) => `${clock(start)}-${clock(end)}`;

/**
 * What the pip on each row means.
 *
 * Blocked and contested are deliberately different colours because they are
 * different decisions: blocked means the room is taken and approving would
 * double-book it, contested means somebody else is asking for the same hour and
 * whoever is granted it, the other has to be refused.
 */
const VERDICT: Record<string, { tone: BadgeTone; label: string }> = {
  blocked: { tone: "red", label: "Clashes" },
  contested: { tone: "orange", label: "Contested" },
  warning: { tone: "slate", label: "Check" },
  clear: { tone: "green", label: "Free" },
};

const KIND: Record<string, string> = {
  booking: "New booking",
  change: "Change",
};

export function ApprovalsView({ initial }: { initial: Queue }) {
  const utils = api.useUtils();
  const [filter, setFilter] = useState<"all" | "booking" | "change">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState<string | null>(null);

  const queue = api.events.approvalQueue.useQuery(undefined, {
    initialData: initial,
    // The queue is a shared work list — somebody else may be clearing it too.
    refetchOnWindowFocus: true,
  });

  const settled = async () => {
    setFailed(null);
    setOpenId(null);
    setNote("");
    await Promise.all([
      utils.events.invalidate(),
      utils.timetable.invalidate(),
    ]);
  };
  const failing = {
    onError: (error: { message: string }) => setFailed(error.message),
  };

  const approve = api.events.approve.useMutation({
    onSuccess: settled,
    ...failing,
  });
  const reject = api.events.reject.useMutation({
    onSuccess: settled,
    ...failing,
  });
  const approveChange = api.events.approveChange.useMutation({
    onSuccess: settled,
    ...failing,
  });
  const rejectChange = api.events.rejectChange.useMutation({
    onSuccess: settled,
    ...failing,
  });

  const deciding =
    approve.isPending ||
    reject.isPending ||
    approveChange.isPending ||
    rejectChange.isPending;

  const items = useMemo(
    () =>
      (queue.data?.rows ?? []).filter(
        (item) => filter === "all" || item.kind === filter,
      ),
    [queue.data, filter],
  );

  const counts = useMemo(() => {
    // `rows` is the whole queue, not a page of it — see `wholeList` in
    // `approvalQueue`. The tab counts would be lying otherwise.
    const all = queue.data?.rows ?? [];
    return {
      all: all.length,
      booking: all.filter((i) => i.kind === "booking").length,
      change: all.filter((i) => i.kind === "change").length,
    };
  }, [queue.data]);

  const decide = (item: Item, granting: boolean) => {
    const said = note || undefined;
    if (item.kind === "booking") {
      if (granting) approve.mutate({ id: item.id, note: said });
      else reject.mutate({ id: item.id, reason: said });
      return;
    }
    if (granting) approveChange.mutate({ id: item.id, note: said });
    else rejectChange.mutate({ id: item.id, reason: said });
  };

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Bookings and changes waiting on a decision, and what each one would collide with."
      />

      {/*
        A reading column: the reasons and clashes under an open request are
        sentences, and at the full width of a laptop they ran 1100px a line.
      */}
      <PageBody width="narrow" className="flex flex-col gap-5">
        <div>
          <Segmented
            value={filter}
            onChange={(value) => setFilter(value)}
            items={[
              { value: "all", label: `All (${counts.all})` },
              { value: "booking", label: `Bookings (${counts.booking})` },
              { value: "change", label: `Changes (${counts.change})` },
            ]}
          />
        </div>

        {items.length === 0 ? (
          <EmptyState icon="checkCircle" title="Nothing waiting">
            Requests appear here as people make them.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const verdict = VERDICT[item.severity] ?? VERDICT.clear!;
              const open = openId === item.id;
              const panelId = `approval-${item.kind}-${item.id}`;
              const cancelling =
                item.kind === "change" &&
                "cancelling" in item &&
                Boolean(item.cancelling);
              return (
                <Card key={`${item.kind}-${item.id}`} pad={0}>
                  {/*
                    The request's name leads, on a line of its own, with the
                    verdict pinned to its right: two badges in front of it put
                    the title wherever they happened to leave room, inline on
                    one card and on the next line on the one below. What kind of
                    request it is moved into the meta line as a word.
                  */}
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={open ? panelId : undefined}
                    onClick={() => {
                      setOpenId(open ? null : item.id);
                      setNote("");
                      setFailed(null);
                    }}
                    className={`hover:bg-tint-hover flex w-full cursor-pointer flex-col gap-1.5 px-4 py-4 text-left transition-colors duration-150 sm:px-5 ${
                      open
                        ? "rounded-t-[var(--radius-card)]"
                        : "rounded-[var(--radius-card)]"
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <span className="font-display text-title text-md min-w-0 flex-1 font-semibold tracking-[-0.01em]">
                        {item.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 pt-px">
                        <Badge tone={verdict.tone} dot>
                          {verdict.label}
                        </Badge>
                        <Icon
                          name="chevronDown"
                          size={16}
                          stroke={2}
                          className={`text-muted transition-transform duration-150 ease-out motion-reduce:transition-none ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </span>
                    </span>
                    <span className="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="text-ink font-medium">
                        {KIND[item.kind]}
                      </span>
                      <span>
                        {day(item.startTime)},{" "}
                        <span className="font-mono text-xs tabular-nums">
                          {hours(item.startTime, item.endTime)}
                        </span>
                      </span>
                      {/* The door glyph says "room", which the word in front
                          of "Room Seminar Hall" said twice. */}
                      <span className="inline-flex items-center gap-1">
                        <Icon name="door" size={13} stroke={2} />
                        {item.room.code}
                      </span>
                      {item.recurrenceText && (
                        <span>{item.recurrenceText}</span>
                      )}
                      {item.cohort && <span>{item.cohort}</span>}
                      <span>
                        asked by{" "}
                        {item.requestedBy?.name ??
                          item.requestedBy?.email ??
                          "somebody"}
                      </span>
                    </span>
                  </button>

                  {open && (
                    <div
                      id={panelId}
                      className="flex flex-col gap-4 px-4 pt-4 pb-5 shadow-[inset_0_1px_0_var(--hair-soft)] sm:px-5"
                    >
                      {/* A change is only legible next to what it is changing.
                          A request to call a sitting off has nothing to change
                          it to, so it is the old slot struck through and said
                          in words, not an arrow onto an identical copy. */}
                      {item.was && (
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="text-muted line-through">
                            {item.was.roomCode} ·{" "}
                            <span className="font-mono text-xs tabular-nums">
                              {hours(item.was.startTime, item.was.endTime)}
                            </span>
                          </span>
                          {cancelling ? (
                            <Badge tone="red">Asking to call it off</Badge>
                          ) : (
                            <>
                              <Icon
                                name="arrowRight"
                                size={14}
                                stroke={2}
                                className="text-muted"
                              />
                              <span className="text-title font-semibold">
                                {item.room.code} ·{" "}
                                <span className="font-mono text-xs tabular-nums">
                                  {hours(item.startTime, item.endTime)}
                                </span>
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {item.reason && (
                        <div className="text-sm">
                          <p className="text-muted text-xs font-semibold">
                            Reason given
                          </p>
                          <p className="text-ink mt-0.5">{item.reason}</p>
                        </div>
                      )}

                      {item.verdict.hard.length > 0 && (
                        <Detail
                          tone="bad"
                          title="Approving this would double-book"
                        >
                          {item.verdict.hard.map((conflict, index) => (
                            <li key={index}>{conflict.message}</li>
                          ))}
                        </Detail>
                      )}

                      {item.verdict.contested.length > 0 && (
                        <Detail
                          tone="warn"
                          title="Somebody else wants this slot too"
                        >
                          {item.verdict.contested.map((contest) => (
                            <li key={`${contest.kind}-${contest.id}`}>
                              {contest.title}, asked by{" "}
                              {contest.requestedBy ?? "somebody"},{" "}
                              {contest.roomCode}{" "}
                              {hours(contest.start, contest.end)}. Granting this
                              one refuses that.
                            </li>
                          ))}
                        </Detail>
                      )}

                      {item.verdict.warnings.length > 0 && (
                        <Detail tone="info" title="Worth knowing">
                          {item.verdict.warnings.map((conflict, index) => (
                            <li key={index}>{conflict.message}</li>
                          ))}
                        </Detail>
                      )}

                      <Field label="Note for whoever asked" optional>
                        {(id) => (
                          <Input
                            id={id}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            maxLength={300}
                          />
                        )}
                      </Field>

                      {failed && (
                        <Callout tone="bad" role="alert">
                          {failed}
                        </Callout>
                      )}

                      {/*
                        Refuse first and the approval last, where a footer's
                        primary always sits. Approving over a clash is still the
                        slate primary, worded "Approve anyway": the clash is
                        spelled out in red just above, and the decision is the
                        approver's to make, not a destructive one.
                      */}
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          disabled={deciding}
                          onClick={() => decide(item, false)}
                          className="flex-1 sm:flex-none"
                        >
                          Refuse
                        </Button>
                        <Button
                          variant="primary"
                          icon="check"
                          disabled={deciding}
                          onClick={() => decide(item, true)}
                          className="flex-1 sm:flex-none"
                        >
                          {item.severity === "blocked"
                            ? "Approve anyway"
                            : "Approve"}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}

/**
 * What approving would run into, as a callout in the state it means: a clash
 * is `bad`, a contest is `warn` (a decision between two people, not an error),
 * and anything merely worth knowing is `info`.
 */
function Detail({
  tone,
  title,
  children,
}: {
  tone: CalloutTone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Callout tone={tone} title={title}>
      <ul className="list-disc pl-4">{children}</ul>
    </Callout>
  );
}
