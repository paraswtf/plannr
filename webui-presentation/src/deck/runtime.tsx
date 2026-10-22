"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * How the slides around a component are being shown.
 *
 * `instant` is true in the presenter's previews and in snapshot exports: a
 * step there should land on its final state rather than play.
 */
export interface DeckRuntime {
  instant: boolean;
}

const RuntimeContext = createContext<DeckRuntime>({ instant: false });

export function DeckRuntimeProvider({
  value,
  children,
}: {
  value: DeckRuntime;
  children: ReactNode;
}) {
  return (
    <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
  );
}

export const useDeckRuntime = () => useContext(RuntimeContext);
