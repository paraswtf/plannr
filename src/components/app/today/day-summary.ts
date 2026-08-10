export interface DayEntry {
  start: Date;
  end: Date;
}

export interface DaySummary<T extends DayEntry> {
  list: T[];
  ongoing: T | undefined;
  next: T | undefined;
}

/**
 * Splits a day's schedule into "happening now" and "up next".
 *
 * Pure and clock-driven: the ticking `now` re-derives this without touching the
 * network, which is what keeps the countdowns honest between refetches.
 */
export function summariseDay<T extends DayEntry>(
  entries: T[],
  now: Date,
): DaySummary<T> {
  const list = [...entries].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  return {
    list,
    ongoing: list.find((e) => e.start <= now && now < e.end),
    next: list.find((e) => e.start > now),
  };
}

/** "45 mins" / "1h 20m", matching the prototype's phrasing. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
