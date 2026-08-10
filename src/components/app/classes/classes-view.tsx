"use client";

import { EventCard } from "~/components/app/event-card";
import { PageHeader } from "~/components/app/shell/page-header";
import {
  formatDuration,
  summariseDay,
} from "~/components/app/today/day-summary";
import { useNow } from "~/components/app/timetable/use-now";
import { Card } from "~/components/ui/card";
import { Stat } from "~/components/ui/stat";
import { formatHourLabel, isoWeekday } from "~/lib/dates";
import { api, type RouterOutputs } from "~/trpc/react";

type MyDay = RouterOutputs["timetable"]["myDay"];
type MyWeek = RouterOutputs["timetable"]["myWeek"];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function ClassesView({
  initialDay,
  initialWeek,
  weekFrom,
  weekTo,
}: {
  initialDay: MyDay;
  initialWeek: MyWeek;
  weekFrom: string;
  weekTo: string;
}) {
  const now = useNow(30_000);

  const { data: day } = api.timetable.myDay.useQuery(
    { date: new Date(initialDay.from) },
    { initialData: initialDay, refetchInterval: 60_000 },
  );
  const { data: week } = api.timetable.myWeek.useQuery(
    { from: new Date(weekFrom), to: new Date(weekTo) },
    { initialData: initialWeek, refetchInterval: 60_000 },
  );

  const timeZone = day?.timeZone ?? "Asia/Kolkata";
  const { list, ongoing } = summariseDay(day?.occurrences ?? [], now);

  const weekList = week ?? [];
  const groupCount = new Set(weekList.map((o) => o.groupId).filter(Boolean))
    .size;
  const upcoming = weekList
    .filter((o) => o.start > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

  return (
    <>
      <PageHeader
        title="My classes"
        subtitle="Your teaching schedule this week"
      />
      <div className="px-9 pt-2 pb-10">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Classes this week"
            value={weekList.length}
            note={`across ${groupCount} group${groupCount === 1 ? "" : "s"}`}
            icon="calendar"
            tone="slate"
          />
          <Stat
            label="Teaching today"
            value={list.length}
            note={new Intl.DateTimeFormat("en-IN", {
              timeZone,
              weekday: "short",
              day: "numeric",
              month: "short",
            }).format(now)}
            icon="clock"
            tone="orange"
            delta={ongoing ? "live now" : undefined}
            deltaTone="red"
          />
          <Stat
            label="Next class"
            value={upcoming ? upcoming.roomCode : "—"}
            note={
              upcoming
                ? `${upcoming.title} · ${formatHourLabel(upcoming.start, timeZone)}`
                : "nothing scheduled"
            }
            icon="mapPin"
            tone="green"
          />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="font-display text-red mb-3 text-[19px] font-bold tracking-[-0.02em]">
              today
            </h2>
            {list.length > 0 ? (
              <div className="flex flex-col gap-3">
                {list.map((o) => (
                  <EventCard
                    key={o.occurrenceId}
                    title={`${o.roomCode} · ${o.title}`}
                    start={o.start}
                    end={o.end}
                    faculty={o.groupLabel}
                    timeZone={timeZone}
                    status={o === ongoing ? "ongoing" : undefined}
                    statusText={
                      o === ongoing
                        ? `ongoing · ends in ${formatDuration(o.end.getTime() - now.getTime())}`
                        : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <Card>
                <p className="text-muted m-0 text-[14px]">
                  No classes scheduled today.
                </p>
              </Card>
            )}
          </div>

          <Card title="This week" pad={18}>
            <div className="flex flex-col">
              {DAYS.map((label, index) => {
                const dayClasses = weekList
                  .filter((o) => isoWeekday(o.start, timeZone) === index + 1)
                  .sort((a, b) => a.start.getTime() - b.start.getTime());
                const isToday = isoWeekday(now, timeZone) === index + 1;
                return (
                  <div
                    key={label}
                    className="flex gap-3 py-2.5"
                    style={
                      index < DAYS.length - 1
                        ? { boxShadow: "inset 0 -1px 0 var(--hair-soft)" }
                        : undefined
                    }
                  >
                    <span
                      className="w-9 shrink-0 pt-0.5 font-mono text-[12px] font-bold"
                      style={{
                        color: isToday ? "var(--red)" : "var(--muted)",
                      }}
                    >
                      {label}
                    </span>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {dayClasses.length > 0 ? (
                        dayClasses.map((o) => (
                          <span
                            key={o.occurrenceId}
                            className="rounded-md px-2 py-1 text-[12px] font-semibold"
                            style={{
                              background: "rgba(68,88,121,0.10)",
                              color: "#324464",
                            }}
                          >
                            {o.roomCode} · {formatHourLabel(o.start, timeZone)}
                          </span>
                        ))
                      ) : (
                        <span className="text-faint text-[12.5px]">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
