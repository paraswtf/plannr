"use client";

import { useState } from "react";

import { PageHeader } from "~/components/app/shell/page-header";
import { Segmented } from "~/components/ui/segmented";
import { addDays, startOfLocalDay } from "~/lib/dates";
import type { Role } from "~/lib/permissions";
import { api } from "~/trpc/react";
import { TimetableGrid, type GridEvent } from "./timetable-grid";

import type { RouterOutputs } from "~/trpc/react";

type GridData = RouterOutputs["timetable"]["grid"];

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TimetableView({
  initialDate,
  initial,
  role,
}: {
  initialDate: string;
  initial: GridData;
  role: Role;
}) {
  const [date, setDate] = useState(() => new Date(initialDate));
  const [buildingId, setBuildingId] = useState<string | undefined>();

  const { data } = api.timetable.grid.useQuery(
    { date, buildingId },
    {
      initialData:
        date.toISOString() === initialDate && !buildingId ? initial : undefined,
      // Other people book rooms too; pick their changes up without polling hard.
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      placeholderData: (previous) => previous,
    },
  );

  const timeZone = data?.timeZone ?? "Asia/Kolkata";
  const settings = data?.settings;
  const startHour = (settings?.dayStartMinutes ?? 480) / 60;
  const endHour = (settings?.dayEndMinutes ?? 1080) / 60;

  const events: GridEvent[] = (data?.occurrences ?? []).map((o) => ({
    occurrenceId: o.occurrenceId,
    roomId: o.roomId,
    start: o.start,
    end: o.end,
    title: o.title,
    subtitle: o.groupLabel,
    isRecurring: o.isRecurring,
  }));

  const today = startOfLocalDay(new Date(), timeZone);
  const isToday = startOfLocalDay(date, timeZone).getTime() === today.getTime();

  // Monday-anchored week around the selected day.
  const weekStart = startOfLocalDay(date, timeZone);
  const weekdayIndex = (weekStart.getDay() + 6) % 7;
  const monday = addDays(weekStart, -weekdayIndex, timeZone);
  const weekDays = DAY_NAMES.slice(0, 5).map((label, i) => ({
    value: addDays(monday, i, timeZone).toISOString(),
    label,
  }));

  const buildings = new Map(
    (data?.rooms ?? []).map((r) => [r.building.id, r.building.name]),
  );

  return (
    <>
      <PageHeader
        title="Timetable"
        subtitle={`${data?.rooms.length ?? 0} rooms · ${events.length} scheduled`}
      />
      <div className="px-9 pt-2 pb-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            items={weekDays}
            value={startOfLocalDay(date, timeZone).toISOString()}
            onChange={(value) => setDate(new Date(value))}
          />
          <div className="flex items-center gap-3">
            <select
              value={buildingId ?? ""}
              onChange={(e) => setBuildingId(e.target.value || undefined)}
              className="bg-surface text-ink rounded-[10px] px-3 py-2 text-[13px] font-medium"
              style={{ boxShadow: "var(--ring)" }}
            >
              <option value="">All buildings</option>
              {[...buildings].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <span className="text-faint font-mono text-[12px]">
              rooms × time
            </span>
          </div>
        </div>

        {data && data.rooms.length > 0 ? (
          <TimetableGrid
            rooms={data.rooms.map((r) => ({ id: r.id, code: r.code }))}
            events={events}
            timeZone={timeZone}
            startHour={startHour}
            endHour={endHour}
            slotMinutes={settings?.slotMinutes ?? 60}
            showNowLine={isToday}
          />
        ) : (
          <div
            className="bg-surface text-muted rounded-[var(--radius-card)] p-10 text-center text-[14px]"
            style={{ boxShadow: "var(--ring)" }}
          >
            No rooms yet. An admin can add them from the Rooms tab.
          </div>
        )}

        <p className="text-faint mt-3 text-[12.5px]">
          {role === "STUDENT"
            ? "Click a block to see the details."
            : "Click a block for details, or an empty slot to book it."}
        </p>
      </div>
    </>
  );
}
