"use client";

import { formatHourLabel, localTimeOnDay } from "~/lib/dates";

export type SlotKind = "free" | "busy" | "overlap";

export interface BusyInterval {
  start: Date;
  end: Date;
  title: string;
}

/**
 * Start-time picker. Each slot says whether the room is taken *at* that time
 * ("busy") or whether a booking of the chosen length starting there would run
 * into something ("overlap") — the distinction the prototype makes, and the one
 * that stops people picking a start that looks free but cannot fit.
 */
export function SlotGrid({
  day,
  timeZone,
  startMinutes,
  endMinutes,
  slotMinutes,
  durationMinutes,
  busy,
  value,
  onChange,
}: {
  day: Date;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  slotMinutes: number;
  durationMinutes: number;
  busy: BusyInterval[];
  value: Date | null;
  onChange: (start: Date) => void;
}) {
  const slots: Array<{ start: Date; kind: SlotKind; clash?: BusyInterval }> =
    [];

  for (let m = startMinutes; m + slotMinutes <= endMinutes; m += slotMinutes) {
    const start = localTimeOnDay(day, m, timeZone);
    const end = new Date(start.getTime() + durationMinutes * 60_000);

    const occupied = busy.find((b) => b.start <= start && start < b.end);
    if (occupied) {
      slots.push({ start, kind: "busy", clash: occupied });
      continue;
    }
    const spill = busy.find((b) => start < b.end && b.start < end);
    const runsLate =
      end.getTime() > localTimeOnDay(day, endMinutes, timeZone).getTime();
    slots.push({
      start,
      kind: spill || runsLate ? "overlap" : "free",
      clash: spill,
    });
  }

  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5">
        {slots.map(({ start, kind, clash }) => {
          const selected = value?.getTime() === start.getTime();
          const background = selected
            ? "var(--slate)"
            : kind === "busy"
              ? "rgba(220,56,72,0.10)"
              : kind === "overlap"
                ? "rgba(246,167,59,0.14)"
                : "var(--surface)";
          const color = selected
            ? "#fff"
            : kind === "busy"
              ? "#b02636"
              : kind === "overlap"
                ? "#a2660f"
                : "var(--app-title)";

          return (
            <button
              key={start.toISOString()}
              type="button"
              onClick={() => onChange(start)}
              title={clash ? `${clash.title}` : "available"}
              className="relative cursor-pointer rounded-[9px] px-1 py-2 font-mono text-[12.5px] font-bold transition-colors"
              style={{
                background,
                color,
                boxShadow: selected
                  ? "0 2px 8px rgba(68,88,121,0.32)"
                  : kind === "free"
                    ? "var(--ring)"
                    : "none",
              }}
            >
              {formatHourLabel(start, timeZone)}
              {kind === "busy" && !selected && (
                <span
                  className="absolute top-1 right-1 h-[5px] w-[5px] rounded-full"
                  style={{ background: "var(--red)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="text-faint mt-2.5 flex flex-wrap gap-3.5 text-[11.5px] font-semibold">
        <Legend background="var(--surface)" ring>
          free
        </Legend>
        <Legend background="rgba(220,56,72,0.18)">booked</Legend>
        <Legend background="rgba(246,167,59,0.22)">would overlap</Legend>
      </div>
    </div>
  );
}

function Legend({
  background,
  ring = false,
  children,
}: {
  background: string;
  ring?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i
        className="h-[9px] w-[9px] rounded-[3px]"
        style={{ background, boxShadow: ring ? "var(--ring)" : undefined }}
      />
      {children}
    </span>
  );
}
