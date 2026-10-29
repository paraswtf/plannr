"use client";

import Link from "next/link";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { buttonClass } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { ASSIGNMENT_TYPE_META } from "~/lib/assignments";
import { formatDayLabel, formatHourLabel } from "~/lib/dates";

import { buildRows, dayStart } from "./slots-table";
import {
  STATE_COPY,
  SittingLine,
  TZ,
  type AssignmentDetailData,
} from "./sitting-card";

/** "Tue 4 Nov, 10am" in the institution's time. */
const at = (d: Date) => `${formatDayLabel(d, TZ)}, ${formatHourLabel(d, TZ)}`;

/** What a student needs from the paper: whether they can open it yet. */
function PaperState({ detail }: { detail: AssignmentDetailData }) {
  const paper = detail.paper;
  const now = new Date();
  if (!paper) {
    return (
      <p className="text-muted text-sm">
        Your teacher has not set the paper yet.
      </p>
    );
  }
  const window = "window" in paper ? paper.window : null;
  if (!window) {
    return (
      <p className="text-muted text-sm">
        {detail.type === "CLASS_TEST_ONLINE"
          ? "The paper opens when your teacher releases it. You can answer it from anywhere."
          : "The paper opens when your teacher releases it in class."}
      </p>
    );
  }
  if (now > window.closesAt) {
    return (
      <p className="text-muted text-sm">
        The paper closed at{" "}
        <span className="font-mono tabular-nums">{at(window.closesAt)}</span>.
      </p>
    );
  }
  return (
    <p className="text-ink text-sm">
      The paper is open until{" "}
      <span className="font-mono tabular-nums">
        {formatHourLabel(window.closesAt, TZ)}
      </span>
      .
    </p>
  );
}

/** Shown over a page whose last background refresh failed. */
export function RefreshFailed() {
  return (
    <Callout tone="warn">
      Plannr could not refresh this page just now, so it may be out of date. It
      tries again by itself.
    </Callout>
  );
}

/** The student's half of an assignment: what, when and where. */
export function StudentAssignment({
  detail,
  refreshFailed = false,
}: {
  detail: AssignmentDetailData;
  /** The page's last background refresh failed: what shows may be out of date. */
  refreshFailed?: boolean;
}) {
  const meta = ASSIGNMENT_TYPE_META[detail.type];
  const sitting = detail.sittings.find((s) => s.teamId === null) ?? null;
  const state = sitting && sitting.state !== "ok" ? sitting.state : null;
  const rows = meta.isTest ? [] : buildRows(detail);
  const mine = rows.find((r) => r.team.mine) ?? null;
  const others = rows.filter((r) => !r.team.mine);

  return (
    <>
      <PageHeader
        title={detail.title}
        back={{ href: "/assignments", label: "Assignments" }}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone="slate">{meta.label}</Badge>
            <span>
              {[detail.course?.title, detail.group.label]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        }
      />
      <PageBody width="narrow">
        <div className="flex flex-col gap-5">
          {refreshFailed && <RefreshFailed />}
          {meta.isTest && (
            <Card title="When and where">
              {sitting ? (
                <div className="flex flex-col gap-3">
                  <SittingLine sitting={sitting} />
                  {state && (
                    <Callout tone={state === "pending" ? "warn" : "bad"}>
                      {state === "pending"
                        ? "The class for this test is still waiting for approval. It may move."
                        : "The class for this test was called off. Your teacher will set another."}
                    </Callout>
                  )}
                  {detail.durationMinutes && meta.answeredInApp && (
                    <p className="text-muted text-sm">
                      You have{" "}
                      <span className="font-mono tabular-nums">
                        {detail.durationMinutes}
                      </span>{" "}
                      minutes once the paper is open.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted text-sm">
                  The class for this test has not been set yet.
                </p>
              )}
            </Card>
          )}

          {meta.answeredInApp && (
            <Card title="The paper">
              <div className="flex flex-col gap-3">
                <PaperState detail={detail} />
                <div>
                  <Link
                    href={`/assignments/${detail.id}/answer`}
                    className={buttonClass("primary", "md")}
                  >
                    Open the test
                  </Link>
                </div>
              </div>
            </Card>
          )}

          {!meta.isTest && (
            <>
              <Card title="Your team">
                {mine ? (
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="text-title text-base font-semibold">
                        {mine.team.name}
                      </div>
                      {mine.team.topic && (
                        <div className="text-muted text-sm">
                          {mine.team.topic}
                        </div>
                      )}
                    </div>
                    <ul className="flex flex-col gap-1">
                      {mine.team.members.map((m) => (
                        <li
                          key={m.studentId}
                          className="text-ink flex items-baseline gap-2 text-sm"
                        >
                          <span>{m.name}</span>
                          <span className="text-faint font-mono text-xs">
                            {m.prn}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col gap-2 pt-1 shadow-[0_-1px_0_var(--hair-soft)]">
                      <span className="text-title pt-2 text-xs font-semibold">
                        Your slot
                      </span>
                      {mine.slot ? (
                        <>
                          <SittingLine sitting={mine.slot} />
                          {mine.estimate && (
                            <span className="text-muted text-sm">
                              Your team goes{" "}
                              {mine.index === 0
                                ? "first"
                                : `number ${mine.index + 1}`}
                              , from about{" "}
                              <span className="font-mono tabular-nums">
                                {formatHourLabel(mine.estimate, TZ)}
                              </span>
                              .
                            </span>
                          )}
                          {mine.slot.state !== "ok" && (
                            <Badge tone={STATE_COPY[mine.slot.state].tone}>
                              {STATE_COPY[mine.slot.state].badge}
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-muted text-sm">
                          Your teacher has not booked a slot yet.
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted text-sm">
                    You are not in a team yet. Your teacher puts the teams
                    together.
                  </p>
                )}
              </Card>

              {detail.window && (
                <p className="text-muted text-sm">
                  Presentations run from{" "}
                  {formatDayLabel(dayStart(detail.window.start), TZ)} to{" "}
                  {formatDayLabel(dayStart(detail.window.end), TZ)}.
                  {detail.minutesPerTeam &&
                    ` Each team has ${detail.minutesPerTeam} minutes.`}
                </p>
              )}

              {others.length > 0 && (
                <Card title="Other teams">
                  <ul className="flex flex-col">
                    {others.map((r) => (
                      <li
                        key={r.team.id}
                        className="text-ink py-1.5 text-sm shadow-[0_1px_0_var(--hair-soft)] last:shadow-none"
                      >
                        {r.team.name}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}

          {detail.instructions && (
            <Card title="Instructions">
              <p className="text-ink text-sm whitespace-pre-wrap">
                {detail.instructions}
              </p>
            </Card>
          )}

          {detail.setBy && (
            <p className="text-faint text-xs">Set by {detail.setBy.name}</p>
          )}
        </div>
      </PageBody>
    </>
  );
}
