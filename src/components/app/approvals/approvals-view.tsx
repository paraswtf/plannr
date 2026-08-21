"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge, type BadgeTone } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { api, type RouterOutputs } from "~/trpc/react";

type Queue = RouterOutputs["events"]["approvalQueue"];
type Item = Queue[number];

const TZ = "Asia/Kolkata";

const when = (start: Date, end: Date) =>
  `${start.toLocaleString("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  })}, ${start.toLocaleString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  })}–${end.toLocaleString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  })}`;

const clock = (at: Date) =>
  at.toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

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
    await Promise.all([utils.events.invalidate(), utils.timetable.invalidate()]);
  };
  const failing = { onError: (error: { message: string }) => setFailed(error.message) };

  const approve = api.events.approve.useMutation({ onSuccess: settled, ...failing });
  const reject = api.events.reject.useMutation({ onSuccess: settled, ...failing });
  const approveChange = api.events.approveChange.useMutation({ onSuccess: settled, ...failing });
  const rejectChange = api.events.rejectChange.useMutation({ onSuccess: settled, ...failing });

  const deciding =
    approve.isPending || reject.isPending || approveChange.isPending || rejectChange.isPending;

  const items = useMemo(
    () => (queue.data ?? []).filter((item) => filter === "all" || item.kind === filter),
    [queue.data, filter],
  );

  const counts = useMemo(() => {
    const all = queue.data ?? [];
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

      <div className="mb-5">
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
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Icon name="checkCircle" size={22} />
            <p className="text-[15px] font-semibold">Nothing waiting</p>
            <p className="text-muted text-[13px]">
              Requests appear here as people make them.
            </p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const verdict = VERDICT[item.severity] ?? VERDICT.clear!;
            const open = openId === item.id;
            return (
              <Card key={`${item.kind}-${item.id}`} pad={0}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(open ? null : item.id);
                    setNote("");
                    setFailed(null);
                  }}
                  className="flex w-full cursor-pointer flex-col gap-2 p-5 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{KIND[item.kind]}</Badge>
                    <Badge tone={verdict.tone} dot>
                      {verdict.label}
                    </Badge>
                    <span className="text-[15px] font-semibold">{item.title}</span>
                  </div>
                  <div className="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                    <span>{when(item.startTime, item.endTime)}</span>
                    <span>Room {item.room.code}</span>
                    {item.recurrenceText && <span>{item.recurrenceText}</span>}
                    {item.cohort && <span>{item.cohort}</span>}
                    <span>
                      asked by {item.requestedBy?.name ?? item.requestedBy?.email ?? "somebody"}
                    </span>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-[rgba(44,49,53,0.08)] px-5 pt-4 pb-5">
                    {/* A change is only legible next to what it is changing. */}
                    {item.was && (
                      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px]">
                        <span className="text-muted line-through">
                          {item.was.roomCode} · {clock(item.was.startTime)}–{clock(item.was.endTime)}
                        </span>
                        <Icon name="arrowRight" size={14} />
                        <span className="font-semibold">
                          {item.room.code} · {clock(item.startTime)}–{clock(item.endTime)}
                        </span>
                        {item.kind === "change" && "cancelling" in item && item.cancelling && (
                          <Badge tone="red">Asking to call it off</Badge>
                        )}
                      </div>
                    )}

                    {item.reason && (
                      <p className="mb-4 text-[13px]">
                        <span className="text-muted">Reason given: </span>
                        {item.reason}
                      </p>
                    )}

                    {item.verdict.hard.length > 0 && (
                      <Detail tone="red" title="Approving this would double-book">
                        {item.verdict.hard.map((conflict, index) => (
                          <li key={index}>{conflict.message}</li>
                        ))}
                      </Detail>
                    )}

                    {item.verdict.contested.length > 0 && (
                      <Detail tone="orange" title="Somebody else wants this slot too">
                        {item.verdict.contested.map((contest) => (
                          <li key={`${contest.kind}-${contest.id}`}>
                            {contest.title} — {contest.requestedBy ?? "somebody"}, {contest.roomCode}{" "}
                            {clock(contest.start)}–{clock(contest.end)}. Granting this one refuses that.
                          </li>
                        ))}
                      </Detail>
                    )}

                    {item.verdict.warnings.length > 0 && (
                      <Detail tone="slate" title="Worth knowing">
                        {item.verdict.warnings.map((conflict, index) => (
                          <li key={index}>{conflict.message}</li>
                        ))}
                      </Detail>
                    )}

                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="A note for whoever asked (optional)"
                      maxLength={300}
                      className="bg-surface-2 mt-1 mb-3 w-full rounded-[10px] px-3 py-2 text-[13px] outline-none"
                    />

                    {failed && <p className="mb-3 text-[13px] text-[var(--red)]">{failed}</p>}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={deciding}
                        onClick={() => decide(item, true)}
                        className="plr-grad cursor-pointer rounded-[10px] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        {item.severity === "blocked" ? "Approve anyway" : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={deciding}
                        onClick={() => decide(item, false)}
                        className="bg-surface-2 cursor-pointer rounded-[10px] px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
                      >
                        Refuse
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Detail({
  tone,
  title,
  children,
}: {
  tone: BadgeTone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5">
        <Badge tone={tone} dot>
          {title}
        </Badge>
      </div>
      <ul className="text-muted list-disc pl-5 text-[13px] leading-relaxed">{children}</ul>
    </div>
  );
}
