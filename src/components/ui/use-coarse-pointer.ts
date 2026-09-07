"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the thing pointing at this screen is a finger.
 *
 * Keyed on `pointer: coarse` rather than a width, the same question the app
 * already asks in `globals.css` to stop iOS zooming into a small input, and for
 * the same reason: it is the input device that decides, not how wide the window
 * happens to be. A narrow desktop window has no finger and wants none of this.
 *
 * Answered `false` on the server and on the first client render, then corrected
 * before paint. Guessing the other way would render a rail nobody can use and
 * fetch two neighbouring days for a laptop that will only ever press an arrow.
 */

const FINGER = "(pointer: coarse)";

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(FINGER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const read = () => window.matchMedia(FINGER).matches;

/** The server has no pointer at all, and the finer answer is the safe one. */
const onServer = () => false;

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, read, onServer);
}
