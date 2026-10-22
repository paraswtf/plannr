"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The line between the audience window and the presenter window.
 *
 * Both are pages of the same site, so a BroadcastChannel is enough: the deck
 * announces where it is, and the presenter sends it "next", "prev" or "go".
 */
export type DeckMessage =
  | { type: "state"; index: number; step: number }
  | { type: "hello" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "go"; index: number; step: number };

const CHANNEL = "plannr-deck";

export function useDeckChannel(onMessage: (message: DeckMessage) => void) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (event: MessageEvent<DeckMessage>) =>
      handler.current(event.data);
    channel.current = bc;
    return () => {
      bc.close();
      channel.current = null;
    };
  }, []);

  return useCallback(
    (message: DeckMessage) => channel.current?.postMessage(message),
    [],
  );
}

/** `#students-ranking/2` ⇄ { id: "students-ranking", step: 2 } */
export function parseHash(hash: string): { id: string; step: number } | null {
  const raw = decodeURIComponent(hash.replace(/^#\/?/, ""));
  if (!raw) return null;
  const [id = "", step = "0"] = raw.split("/");
  return { id, step: Math.max(0, Number.parseInt(step, 10) || 0) };
}

export function formatHash(id: string, step: number) {
  return `#${id}${step > 0 ? `/${step}` : ""}`;
}
