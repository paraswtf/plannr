"use client";

import { EventCard } from "~/components/app/event-card";
import { PageHeader } from "~/components/app/shell/page-header";
import { useNow } from "~/components/app/timetable/use-now";
import { Card } from "~/components/ui/card";
import { api, type RouterOutputs } from "~/trpc/react";
import { formatDuration, summariseDay } from "./day-summary";

type MyDay = RouterOutputs["timetable"]["myDay"];

export function TodayView({
  initial,
  firstName,
}: {
  initial: MyDay;
  firstName: string;
}) {
  const now = useNow(30_000);

  const { data } = api.timetable.myDay.useQuery(
    { date: new Date(initial.from) },
    {
      initialData: initial,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );

  const timeZone = data?.timeZone ?? "Asia/Kolkata";
  const { list, ongoing, next } = summariseDay(data?.occurrences ?? [], now);

  const groupLabel =
    data?.scope?.kind === "student" ? (list[0]?.groupLabel ?? null) : null;

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={groupLabel ?? "Your lectures for today"}
      />
      <div className="px-9 pt-2 pb-10">
        <div className="mb-8">
          <h2 className="font-display text-title text-[40px] leading-[1.05] font-bold tracking-[-0.03em]">
            Hello{" "}
            <span
              style={{
                background: "var(--grad-brand)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {firstName}
            </span>
            ,
          </h2>
          <p className="text-ink mt-2 text-[17px] font-medium">
            {list.length > 0
              ? "Here are your lectures for today"
              : "Nothing scheduled for you today."}
          </p>
        </div>

        <div className="grid items-start gap-9 xl:grid-cols-[1fr_1.05fr_1fr]">
          <div className="flex flex-col gap-5">
            <SectionLabel color="#4e7d3a">ongoing!</SectionLabel>
            {ongoing ? (
              <EventCard
                title={`${ongoing.roomCode} · ${ongoing.title}`}
                start={ongoing.start}
                end={ongoing.end}
                faculty={ongoing.facultyName}
                timeZone={timeZone}
                status="ongoing"
                statusText={`ends in ${formatDuration(ongoing.end.getTime() - now.getTime())}`}
              />
            ) : (
              <Card>
                <p className="text-muted m-0 text-[14px]">
                  No lecture running right now — enjoy the break.
                </p>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-3.5 xl:border-x-2 xl:border-dashed xl:border-[rgba(68,88,121,0.4)] xl:px-6">
            <div className="text-faint font-mono text-[12px]">
              full day · {list.length} lecture{list.length === 1 ? "" : "s"}
            </div>
            {list.map((o) => (
              <EventCard
                key={o.occurrenceId}
                title={`${o.roomCode} · ${o.title}`}
                start={o.start}
                end={o.end}
                faculty={o.facultyName}
                timeZone={timeZone}
                status={
                  o === ongoing
                    ? "ongoing"
                    : o === next
                      ? "upcoming"
                      : undefined
                }
                statusText={
                  o === ongoing
                    ? `ongoing · ends in ${formatDuration(o.end.getTime() - now.getTime())}`
                    : o === next
                      ? `up next · in ${formatDuration(o.start.getTime() - now.getTime())}`
                      : undefined
                }
                highlight={o === next}
              />
            ))}
            {list.length === 0 && (
              <Card>
                <p className="text-muted m-0 text-[14px]">
                  Your timetable is clear today.
                </p>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <SectionLabel color="var(--red)">next →</SectionLabel>
            {next ? (
              <EventCard
                title={`${next.roomCode} · ${next.title}`}
                start={next.start}
                end={next.end}
                faculty={next.facultyName}
                timeZone={timeZone}
                status="upcoming"
                highlight
                statusText={`in ${formatDuration(next.start.getTime() - now.getTime())}`}
              />
            ) : (
              <Card>
                <p className="text-muted m-0 text-[14px]">
                  That&apos;s your last lecture for the day.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SectionLabel({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <span
      className="font-display text-[21px] font-bold tracking-[-0.02em]"
      style={{ color }}
    >
      {children}
    </span>
  );
}
