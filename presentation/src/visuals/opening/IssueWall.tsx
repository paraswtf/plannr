"use client";

import { isValidElement, useRef, type ReactNode } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";

export interface IssueWallProps {
  step: number;
  active: boolean;
  issues: ReactNode[];
  /** The one-line diagnosis, shown over the wall on step 1. */
  rootCause?: ReactNode;
  /** An icon per issue; by default one is picked from the issue's words. */
  icons?: IconName[];
}

/**
 * Every other issue we found, piling up as chips until the wall is full,
 * then one sentence for the root cause.
 *
 * The wall is laid out by the browser (rows wrap upwards from the floor, so
 * the first issue lands at the bottom), and each chip then falls into its
 * own place from above the box: real travel, accelerating like a dropped
 * thing, with a small bounce and a resting tilt when it lands.
 *
 * Builds (steps = 2):
 *   0 — the issues tumble in and stack. Plays by itself on arrival.
 *   1 — they dim, and `rootCause` is set large over them.
 */

/** Words in an issue, and the icon that says it. First match wins. */
const ICON_WORDS: [RegExp, IconName][] = [
  [/phone|mobile/i, "phone"],
  [/slow|load/i, "hourglass"],
  [/install|\bapp\b/i, "download"],
  [/offline|network|basement/i, "wifiOff"],
  [/click|touch|swipe|keys/i, "cursor"],
  [/own|personal|your/i, "user"],
  [/clash/i, "alert"],
  [/nobody|notif|tells/i, "bell"],
  [/mail/i, "mail"],
  [/test|deadline|assignment/i, "clipboard"],
  [/projector|equipment/i, "monitor"],
  [/room/i, "door"],
];
const FALLBACK: IconName[] = ["x", "alert", "linkBroken", "question"];

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement<{ children?: ReactNode }>(node))
    return textOf(node.props.children);
  return "";
}

function iconFor(issue: ReactNode, i: number): IconName {
  const text = textOf(issue);
  for (const [re, icon] of ICON_WORDS) if (re.test(text)) return icon;
  return FALLBACK[i % FALLBACK.length]!;
}

/** Where each chip comes to rest: a few degrees off, like a real pile. */
const TILT = [
  -0.6, 0.45, -0.25, 0.7, -0.45, 0.3, -0.7, 0.55, -0.35, 0.2, 0.7, -0.55,
];
/** How far each chip is spun as it starts to fall. */
const SPIN = [-14, 11, -8, 16, -12, 9, -17, 13, -10, 7, 15, -11];

export function IssueWall({
  step,
  active,
  issues,
  rootCause,
  icons,
}: IssueWallProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();
  const fall = useRef<gsap.core.Timeline | null>(null);
  const stepAtMount = useRef(step);
  const activeAtMount = useRef(active);
  const instantAtMount = useRef(instant);

  // The pile: built from where the browser put each chip.
  useGSAP(
    () => {
      const box = ref.current;
      if (!box) return;
      const chips = gsap.utils.toArray<HTMLElement>(".iw-chip", box);
      const tl = gsap.timeline({ paused: true });
      // Landing order: the floor row first, left to right, then upwards.
      const order = chips
        .map((el, i) => ({
          el,
          i,
          // Relative to the box: the list itself sits on the box's floor.
          top:
            el.offsetTop +
            ((el.offsetParent as HTMLElement | null)?.offsetTop ?? 0),
          left: el.offsetLeft,
        }))
        .sort((a, b) => b.top - a.top || a.left - b.left);
      order.forEach(({ el, i, top }, n) => {
        const drop = top + el.offsetHeight + 60;
        // Long chips tilt less: a slanted 600px baseline reads as messy.
        const tilt =
          TILT[i % TILT.length]! *
          gsap.utils.clamp(0.3, 1, 400 / el.offsetWidth);
        const spin = SPIN[i % SPIN.length]!;
        const at = n * 0.12;
        const fallFor = 0.42 + Math.sqrt(drop / 700) * 0.22;
        tl.fromTo(
          el,
          { y: -drop, rotation: spin, opacity: 1 },
          {
            y: 0,
            rotation: tilt * 2.2,
            duration: fallFor,
            ease: "power2.in",
            immediateRender: true,
          },
          at,
        );
        // Hidden until its fall begins, so nothing hangs above the box.
        tl.set(el, { visibility: "visible" }, at + 0.001);
        // The landing: a short hop and the tilt settling.
        tl.to(el, { y: -10, duration: 0.11, ease: "power1.out" }, at + fallFor);
        tl.to(
          el,
          { y: 0, duration: 0.13, ease: "power1.in" },
          at + fallFor + 0.11,
        );
        tl.to(
          el,
          { rotation: tilt, duration: 0.4, ease: "back.out(2)" },
          at + fallFor,
        );
      });

      fall.current = tl;
      if (instantAtMount.current || stepAtMount.current > 0) tl.progress(1);
      else if (activeAtMount.current) tl.delay(0.3).play();
      return () => {
        tl.kill();
        fall.current = null;
      };
    },
    { scope: ref },
  );

  useGSAP(
    () => {
      const tl = fall.current;
      if (!tl) return;
      // A build that starts before the arrival has finished lands it first.
      if (instant || step > 0) tl.progress(1);
      else if (active && tl.progress() === 0 && !tl.isActive()) tl.play();
    },
    { dependencies: [active, instant, step] },
  );

  useSteps(ref, step, (tl, mark) => {
    tl.to(
      ".iw-wall",
      {
        scale: 0.92,
        y: 24,
        opacity: 0.18,
        filter: "blur(7px)",
        duration: 0.8,
        ease: "power3.inOut",
      },
      0,
    );
    if (rootCause) {
      tl.fromTo(
        ".iw-cause",
        { opacity: 0, y: 70, scale: 1.04 },
        { opacity: 1, y: 0, scale: 1, duration: 0.95, ease: "deck.enter" },
        0.5,
      );
    }
    mark();
  });

  return (
    <div ref={ref} className="absolute inset-0" data-no-enter>
      <div
        className="iw-wall absolute inset-0"
        style={{
          // Chips fall in from above the box: let them emerge from a haze
          // rather than cross the title.
          maskImage: "linear-gradient(to bottom, transparent 0, #000 90px)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0, #000 90px)",
          transformOrigin: "50% 100%",
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <ul className="absolute inset-x-0 bottom-0 flex flex-wrap-reverse content-start justify-center gap-x-4 gap-y-4.5 pb-2">
            {issues.map((issue, i) => (
              <li
                key={i}
                className="iw-chip bg-card flex h-23 items-center gap-5 rounded-[26px] pr-9 pl-4"
                style={{
                  boxShadow:
                    "inset 0 0 0 1px var(--line-strong), 0 14px 30px rgba(0,0,0,0.35)",
                  visibility: "hidden",
                }}
              >
                <span
                  className="flex h-15 w-15 shrink-0 items-center justify-center rounded-[18px]"
                  style={{
                    background: "rgba(255,93,93,0.13)",
                    color: "#ff7d7d",
                  }}
                >
                  <Icon
                    name={icons?.[i] ?? iconFor(issue, i)}
                    size={30}
                    stroke={2}
                  />
                </span>
                <span className="font-body text-fg text-[30px] font-medium tracking-[-0.01em] whitespace-nowrap">
                  {issue}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {rootCause && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p
            className="iw-cause font-display text-fg max-w-345 text-center text-[92px] leading-[1.02] font-bold tracking-[-0.035em] text-balance"
            style={{ opacity: 0 }}
          >
            {rootCause}
          </p>
        </div>
      )}
    </div>
  );
}
