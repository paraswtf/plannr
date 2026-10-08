"use client";

import { useEffect, useState } from "react";

/**
 * A ticking clock for "ongoing", "starts in 20 mins" and the now-line.
 *
 * Deliberately separate from data fetching: the clock moving is not a reason to
 * re-query the server, and re-querying is not how the countdown stays accurate.
 * Starts at null and fills in after mount so the server and client render the
 * same markup.
 *
 * `null` stops it ticking, for a component that was handed a clock from above
 * and only calls this because a hook cannot be called conditionally.
 */
export function useNow(intervalMs: number | null = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (intervalMs === null) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
