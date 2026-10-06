"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

import { MRBS_CSS, mrbsHtml, VIEW } from "./_mrbs-snapshot";

let markup: string | null = null;

/**
 * The college's timetable page (see _mrbs-snapshot.ts) as a still picture:
 * its own markup and stylesheet in a shadow root, laid out in the 1440px
 * window it was copied from, for the caller to scale and place. Inert, so its
 * fields never take the keys that drive the deck. The page is built once per
 * host, so a timeline holding elements inside it keeps holding live ones.
 */
export function MrbsStatic({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    if (root.childElementCount) return;
    markup ??= `<style>${MRBS_CSS}</style>${mrbsHtml()}`;
    root.innerHTML = markup;
  }, []);

  return (
    <div
      ref={host}
      inert
      className={`absolute top-0 left-0 ${className ?? ""}`}
      style={{ width: VIEW.width, height: VIEW.height, ...style }}
    />
  );
}
