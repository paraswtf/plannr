"use client";

import { useMemo, useRef, type CSSProperties, type ReactNode } from "react";

import type { DayEvent, DayLane } from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";
import { SlideBody, SlideHeader } from "~/ui/layout";

import {
  hoursOf,
  layoutLane,
  textOf,
  textWidth,
  type PlacedLabel,
} from "./_research-layout";
import { SWEEP_EASE, sweepTimeAt, useArrival } from "./_research-motion";

export interface DayTimelineProps {
  stakeholder: StakeholderId;
  eyebrow?: ReactNode;
  title: ReactNode;
  lanes: DayLane[];
  /** First and last hour on the axis, 24h. Default 6 → 22. */
  from?: number;
  to?: number;
  /** Lane i is drawn on step i (lane 0 from the start). Steps = lanes.length. */
  step: number;
  /** False while the slide is leaving or previewed: lane 0 waits for it. */
  active?: boolean;
}

/*
 * Geometry, in canvas pixels. The content box is 1664 wide: a column for the
 * lane names, then the track the day is drawn on.
 */
const NAME_W = 340;
const NAME_GAP = 36;
const TRACK_W = 1664 - NAME_W - NAME_GAP;
/** Hours sit this far in from the track's ends, so edge labels have room. */
const PAD = 28;
const AXIS_H = 52;
const LABEL_FONT = 24;
const TIME_FONT = 22;
const TIME_GAP = 10;
const LABEL_H = 32;
/** Space between a dot and the row of labels next to it. */
const LABEL_OFF = 12;
/** How long the playhead takes to cross a day. */
const SWEEP = 1.9;

const TONE: Record<NonNullable<DayEvent["tone"]>, string> = {
  neutral: "var(--fg)",
  good: "var(--good)",
  warn: "var(--warn)",
  bad: "var(--bad)",
};

/**
 * A day, hour by hour, one lane per kind of person: what they do and when,
 * and how they keep track of it. A schedule, not a list of problems: the
 * deck's days give their events no tone, and the problems come after, on
 * their own slides.
 *
 * Each lane's label carries flip id `${stakeholder}-persona-${personaId}`, the
 * same as the persona's name on PersonaCards, so the two slides morph.
 *
 * Every lane is listed from the start, its name faint. Each build sweeps a
 * playhead along the next lane, and its events pop as the playhead passes
 * them; the lanes already told settle back so the new one leads.
 */
export function DayTimeline({
  stakeholder,
  title,
  lanes,
  from = 6,
  to = 22,
  step,
  active = true,
}: DayTimelineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const span = Math.max(1, to - from);
  const xOf = (hours: number) =>
    PAD + ((hours - from) / span) * (TRACK_W - 2 * PAD);
  const dot = lanes.length > 2 ? 40 : 46;
  const tiers = lanes.length > 2 ? 1 : 2;

  const layouts = useMemo(
    () =>
      lanes.map((lane) => {
        const events = [...lane.events].sort(
          (a, b) => hoursOf(a.at) - hoursOf(b.at),
        );
        const placed = layoutLane(
          events.map((e) => ({
            x: PAD + ((hoursOf(e.at) - from) / span) * (TRACK_W - 2 * PAD),
            w:
              textWidth(e.at, TIME_FONT, "mono") +
              TIME_GAP +
              textWidth(textOf(e.label), LABEL_FONT),
          })),
          { dot, dotGap: 6, tiers, min: -NAME_GAP + 14, max: TRACK_W, gap: 28 },
        );
        return events.map((event, i) => ({ event, place: placed[i]! }));
      }),
    [lanes, from, span, dot, tiers],
  );

  const pxPerHour = (TRACK_W - 2 * PAD) / span;
  const every = pxPerHour < 100 ? 2 : 1;
  const hours = Array.from({ length: span + 1 }, (_, i) => from + i);

  /** Sweep lane i: playhead across, track drawn behind it, events as it passes. */
  const sweep = (tl: gsap.core.Timeline, i: number, at: number) => {
    const q = (sel: string) =>
      ref.current?.querySelectorAll(`[data-lane="${i}"] ${sel}`) ?? [];
    const head = q(".rt-head");
    tl.to(q(".rt-name"), { opacity: 1, duration: 0.5, ease: "power2.out" }, at);
    tl.fromTo(
      head,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: "power1.out" },
      at,
    );
    tl.fromTo(
      head,
      { x: 0 },
      { x: TRACK_W, duration: SWEEP, ease: SWEEP_EASE },
      at,
    );
    tl.fromTo(
      q(".rt-progress"),
      { scaleX: 0 },
      {
        scaleX: 1,
        duration: SWEEP,
        ease: SWEEP_EASE,
        transformOrigin: "0% 50%",
      },
      at,
    );
    layouts[i]!.forEach(({ place }, j) => {
      const t = at + sweepTimeAt(place.dot / TRACK_W) * SWEEP - 0.08;
      tl.from(
        q(`[data-ev="${j}"] .rt-dot`),
        { scale: 0, duration: 0.55, ease: "back.out(2.4)" },
        t,
      );
      tl.from(
        q(`[data-ev="${j}"] .rt-label`),
        {
          opacity: 0,
          y: place.side === 0 ? 0 : place.side * -14,
          x: place.side === 0 ? (place.left > place.dot ? -14 : 14) : 0,
          duration: 0.5,
          ease: "power3.out",
        },
        t + 0.06,
      );
    });
    tl.to(
      head,
      { opacity: 0, duration: 0.35, ease: "power1.in" },
      at + SWEEP - 0.15,
    );
  };

  useArrival(
    ref,
    { active, step },
    (tl) => {
      // Names arrive bright (often travelling in from their cards); the lanes
      // still to come settle back while the first one is swept.
      const later = Array.from(
        ref.current?.querySelectorAll(
          '[data-lane]:not([data-lane="0"]) .rt-name',
        ) ?? [],
      );
      if (later.length > 0) {
        tl.fromTo(
          later,
          { opacity: 1 },
          { opacity: 0.32, duration: 0.7, ease: "power2.out" },
          0.45,
        );
      }
      // Sublabels wait for their name, which may still be travelling in.
      const subs = Array.from(ref.current?.querySelectorAll(".rt-sub") ?? []);
      if (subs.length > 0) {
        tl.from(
          subs,
          { y: 10, opacity: 0, duration: 0.5, ease: "deck.enter" },
          0.35,
        );
      }
      if (lanes.length > 0) sweep(tl, 0, 0.55);
    },
    [layouts],
  );

  useSteps(
    ref,
    step,
    (tl, mark) => {
      for (let i = 1; i < lanes.length; i++) {
        const at = tl.duration();
        const earlier = Array.from({ length: i }, (_, k) => k);
        const sel = (s: string) =>
          earlier.flatMap((k) =>
            Array.from(
              ref.current?.querySelectorAll(`[data-lane="${k}"] ${s}`) ?? [],
            ),
          );
        tl.to(
          sel(".rt-calm"),
          { opacity: 0.4, duration: 0.6, ease: "power2.out" },
          at,
        );
        tl.to(
          sel(".rt-name-calm"),
          { opacity: 0.5, duration: 0.6, ease: "power2.out" },
          at,
        );
        sweep(tl, i, at + 0.1);
        mark();
      }
    },
    [layouts],
  );

  return (
    <SlideBody>
      <SlideHeader title={title} titleClassName="max-w-none!" />
      <div ref={ref} className="relative mt-12 min-h-0 flex-1">
        {/* The hours */}
        <div
          className="absolute inset-y-0"
          style={{ left: NAME_W + NAME_GAP, width: TRACK_W }}
        >
          {hours.map((h) => {
            const labelled = (h - from) % every === 0;
            return (
              <div
                key={h}
                className="absolute inset-y-0"
                style={{ left: xOf(h) }}
              >
                {labelled && (
                  <span className="t-mono text-faint absolute top-0 -translate-x-1/2 text-[22px] leading-none">
                    {String(h).padStart(2, "0")}:00
                  </span>
                )}
                <span
                  className="absolute bottom-0 w-px"
                  style={{
                    top: AXIS_H - 10,
                    background: labelled
                      ? "var(--line)"
                      : "color-mix(in srgb, var(--line) 45%, transparent)",
                  }}
                />
              </div>
            );
          })}
        </div>

        <div
          className="absolute inset-x-0 bottom-0 flex flex-col"
          style={{ top: AXIS_H }}
        >
          {lanes.map((lane, i) => (
            <div
              key={lane.personaId}
              data-lane={i}
              className="relative min-h-0 flex-1"
            >
              {/* The persona's name: the morph partner of its card */}
              <div
                className="absolute top-1/2 left-0 flex -translate-y-1/2 flex-col"
                style={{ width: NAME_W }}
              >
                <span
                  data-flip-id={`${stakeholder}-persona-${lane.personaId}`}
                  className="font-display inline-block self-start text-[30px] leading-[1.12] font-semibold tracking-[-0.02em] whitespace-nowrap"
                >
                  <span
                    className="rt-name inline-block"
                    style={{ opacity: i === 0 ? 1 : 0.32 }}
                  >
                    <span className="rt-name-calm inline-block">
                      {lane.label}
                    </span>
                  </span>
                </span>
                {lane.sublabel && (
                  <span
                    className="rt-name t-small text-muted mt-1.5"
                    style={{ opacity: i === 0 ? 1 : 0.32 }}
                  >
                    <span className="rt-sub inline-block">
                      <span className="rt-name-calm">{lane.sublabel}</span>
                    </span>
                  </span>
                )}
              </div>

              {/* The day */}
              <div
                className="absolute top-1/2"
                style={{ left: NAME_W + NAME_GAP, width: TRACK_W, height: 0 }}
              >
                <div className="rt-calm absolute inset-0">
                  <span className="bg-line absolute inset-x-0 -top-px h-0.5 rounded-full" />
                  <span
                    className="rt-progress absolute inset-x-0 h-0.5 rounded-full"
                    style={{
                      top: -1,
                      background: "var(--fg-faint)",
                      transform: "scaleX(0)",
                      transformOrigin: "0% 50%",
                    }}
                  />
                  <Leaders items={layouts[i]!} dot={dot} />
                  {layouts[i]!.map(({ event, place }, j) => (
                    <Event
                      key={j}
                      index={j}
                      event={event}
                      place={place}
                      dot={dot}
                    />
                  ))}
                </div>
                <Playhead />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideBody>
  );
}

/** Where a label's row sits, measured from the line to the label's top edge. */
function rowTop(place: PlacedLabel, dot: number) {
  if (place.side === 0) return -LABEL_H / 2;
  const out = dot / 2 + LABEL_OFF + place.tier * (LABEL_H + 10);
  return place.side < 0 ? -out - LABEL_H : out;
}

function Event({
  index,
  event,
  place,
  dot,
}: {
  index: number;
  event: DayEvent;
  place: PlacedLabel;
  dot: number;
}) {
  const tone = event.tone ?? "neutral";
  const c = TONE[tone];
  const bad = tone === "bad";
  const pad = place.side === 0 ? 8 : 4;
  const covers = place.leader === null && place.side !== 0;
  const centred =
    covers && Math.abs(place.left + place.width / 2 - place.dot) < 3;
  // Text hugs the side its dot is on, so it never drifts away from it.
  const align: CSSProperties["textAlign"] = centred
    ? "center"
    : place.left + place.width / 2 > place.dot
      ? "left"
      : "right";
  // Neutral and good moments are quiet raised discs; friction is ringed in
  // its tone; where the day breaks is the one filled disc, in the accent.
  const dotStyle: CSSProperties = bad
    ? {
        background: "var(--accent)",
        color: "#ffffff",
        boxShadow: "0 0 0 6px var(--accent-soft), var(--shadow-1)",
      }
    : tone === "neutral"
      ? {
          background: "var(--bg-raised)",
          color: "var(--fg-muted)",
          boxShadow: "inset 0 0 0 1.5px var(--line-strong), var(--shadow-1)",
        }
      : {
          background: "var(--bg-raised)",
          color: c,
          boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${c} 55%, transparent), var(--shadow-1)`,
        };
  return (
    <div data-ev={index}>
      <span
        className="rt-dot absolute flex items-center justify-center rounded-full"
        style={{
          left: place.dot - dot / 2,
          top: -dot / 2,
          width: dot,
          height: dot,
          ...dotStyle,
        }}
      >
        {event.icon ? (
          <Icon name={event.icon} size={dot * 0.5} weight="regular" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full bg-current" />
        )}
      </span>
      <span
        className="rt-label absolute flex items-baseline whitespace-nowrap"
        style={{
          left: place.left - pad,
          width: place.width + pad * 2,
          top: rowTop(place, dot),
          height: LABEL_H,
          lineHeight: `${LABEL_H}px`,
          justifyContent:
            align === "center"
              ? "center"
              : align === "left"
                ? "flex-start"
                : "flex-end",
          // An opaque patch, so neither the track nor an hour line runs
          // through the words. Beside-dot labels keep a slimmer patch so
          // their leader still reaches them.
          padding: `0 ${pad}px`,
          background: "var(--bg)",
        }}
      >
        <span
          className="t-mono shrink-0"
          style={{
            fontSize: TIME_FONT,
            marginRight: TIME_GAP,
            // A schedule is read by its times: muted, not faint, so they
            // carry on a projector.
            color: tone === "neutral" ? "var(--fg-muted)" : c,
          }}
        >
          {event.at}
        </span>
        <span
          className="font-body"
          style={{
            fontSize: LABEL_FONT,
            color: bad ? "var(--fg)" : "var(--fg-body)",
            fontWeight: bad ? 500 : 400,
          }}
        >
          {event.label}
        </span>
      </span>
    </div>
  );
}

/** Stems to outer rows, and leaders to labels that sit beside their dot. */
function Leaders({
  items,
  dot,
}: {
  items: { place: PlacedLabel }[];
  dot: number;
}) {
  const paths = items.flatMap(({ place }, j) => {
    if (place.side === 0) return [];
    const top = rowTop(place, dot);
    const mid = top + LABEL_H / 2;
    const fromY = (place.side * dot) / 2;
    if (place.leader !== null) {
      const towards = place.leader > place.dot ? -6 : 6;
      return [
        { j, d: `M${place.dot},${fromY} V${mid} H${place.leader + towards}` },
      ];
    }
    if (place.tier > 0) {
      const edge = place.side < 0 ? top + LABEL_H + 2 : top - 2;
      return [{ j, d: `M${place.dot},${fromY} V${edge}` }];
    }
    return [];
  });
  if (paths.length === 0) return null;
  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ left: 0, top: 0 }}
      width={1}
      height={1}
    >
      {paths.map(({ j, d }) => (
        <g key={j} data-ev={j}>
          <path
            className="rt-label"
            d={d}
            fill="none"
            stroke="var(--line-strong)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}

function Playhead() {
  return (
    <div
      className="rt-head pointer-events-none absolute top-0 left-0"
      style={{ opacity: 0 }}
    >
      <span
        className="absolute w-0.5 -translate-x-1/2"
        style={{
          top: -40,
          height: 80,
          background:
            "linear-gradient(180deg, transparent, var(--accent) 30%, var(--accent) 70%, transparent)",
        }}
      />
      <span
        className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: "var(--accent)",
          boxShadow: "0 0 0 6px var(--accent-soft)",
        }}
      />
    </div>
  );
}
