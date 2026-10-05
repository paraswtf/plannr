"use client";

import QRCode from "qrcode";
import { useMemo, useRef, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";
import { Bezel } from "~/ui/frames";
import { SAFE } from "~/ui/layout";
import { Ph } from "~/ui/placeholder";
import { Card, Chip } from "~/ui/surfaces";

import { useEntrance } from "./_closing-motion";

export interface OpenSourceProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** Full URL, encoded into the QR code: "https://github.com/paraswtf/plannr". */
  repoUrl: string;
  /** Shown as text under the code: "github.com/paraswtf/plannr". */
  repoLabel: string;
  /** Ways to help, e.g. design, code, testing, spreading the word. */
  asks: { icon: IconName; title: ReactNode; body: ReactNode }[];
  /** 0: the ask and the code. 1: the ways to help. Steps = 2. */
  step: number;
  /** The repository's one-line description on its card. */
  description?: ReactNode;
  /** Its star count; a marked placeholder until the real number is in. */
  stars?: ReactNode;
  /** Its main language. `color` is accepted but the dot is drawn in faint ink, so the slide keeps one accent. */
  language?: { name: string; color: string };
}

/* Canvas geometry. */
const LEFT_W = 900;
const RIGHT_X = 1150;
const RIGHT_W = 1920 - SAFE.x - RIGHT_X;
const QR_PX = 400;
const HEAD_H = 330;
const HEAD_REST = SAFE.top + (1080 - SAFE.top - SAFE.bottom - HEAD_H) / 2 - 24;
const ASKS_TOP = SAFE.top + HEAD_H + 28;

/**
 * The call to action: Plannr is open source, here is the repository, and
 * here is how you can help.
 *
 * The QR code is real and drawn as SVG from the `qrcode` package, dark
 * modules on a white plate held in a bezel, printing in row by row behind a
 * scan line as the slide opens. The repository's card sits under it. On the
 * second build the ask travels up out of the middle of its column and the
 * four ways to help rise into the space it leaves, as a list on hairlines.
 */
export function OpenSource({
  title,
  lede,
  repoUrl,
  repoLabel,
  asks,
  step,
  description = "One place for every class, change and room.",
  stars,
  language = { name: "TypeScript", color: "#3178c6" },
}: OpenSourceProps) {
  const root = useRef<HTMLDivElement>(null);
  const qr = useMemo(() => qrRows(repoUrl), [repoUrl]);
  const [owner, repo] = splitRepo(repoLabel);

  const firstStep = useRef(step).current;
  useEntrance(root, (tl) => {
    if (firstStep > 0) {
      tl.from(".os-all", { opacity: 0, duration: 0.7, ease: "power1.out" });
      return;
    }
    tl.from(".os-head-in > *", {
      y: 36,
      opacity: 0,
      duration: 0.9,
      ease: "deck.enter",
      stagger: 0.09,
    });
    tl.from(
      ".os-qr-card",
      { y: 60, opacity: 0, duration: 1, ease: "deck.enter" },
      0.2,
    );
    tl.from(
      ".os-qr-row",
      { opacity: 0, duration: 0.25, ease: "none", stagger: 0.022 },
      0.55,
    );
    tl.fromTo(
      ".os-scan",
      { y: 0, opacity: 1 },
      {
        y: QR_PX,
        duration: qr.rows.length * 0.022 + 0.1,
        ease: "none",
      },
      0.55,
    );
    tl.to(".os-scan", { opacity: 0, duration: 0.3 }, ">-0.1");
    tl.from(
      ".os-repo",
      { y: 50, opacity: 0, duration: 0.95, ease: "deck.enter" },
      0.5,
    );
  });

  useSteps(
    root,
    step,
    (tl, mark) => {
      tl.to(
        ".os-head",
        { y: SAFE.top - HEAD_REST, duration: 1, ease: "deck.morph" },
        0,
      );
      tl.fromTo(
        ".os-ask",
        { y: 70, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.95,
          ease: "deck.enter",
          stagger: 0.09,
          immediateRender: true,
        },
        0.45,
      );
      tl.fromTo(
        ".os-ask-rule",
        { scaleX: 0, transformOrigin: "0% 50%" },
        {
          scaleX: 1,
          duration: 0.9,
          ease: "deck.enter",
          stagger: 0.09,
          immediateRender: true,
        },
        0.5,
      );
      tl.fromTo(
        ".os-ask-icon",
        { scale: 0.4, rotate: -16 },
        {
          scale: 1,
          rotate: 0,
          duration: 0.8,
          ease: "back.out(2)",
          stagger: 0.09,
          immediateRender: true,
        },
        0.65,
      );
      mark();
    },
    [asks.length],
  );

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <div className="os-all absolute inset-0">
        <header
          className="os-head absolute"
          style={{
            left: SAFE.x,
            top: HEAD_REST,
            width: LEFT_W,
            height: HEAD_H,
          }}
        >
          <div className="os-head-in flex flex-col">
            <h1 className="t-title text-fg text-balance">{title}</h1>
            {lede && (
              <p className="t-lede text-muted mt-6 max-w-[42ch] text-balance">
                {lede}
              </p>
            )}
          </div>
        </header>

        <ul
          className="absolute flex flex-col"
          style={{ left: SAFE.x, top: ASKS_TOP, width: LEFT_W }}
        >
          {asks.map((a, i) => (
            <li
              key={i}
              className="os-ask relative grid grid-cols-[52px_176px_1fr] items-start gap-x-6 py-6"
            >
              <span
                aria-hidden
                className="os-ask-rule bg-line-strong absolute inset-x-0 top-0 h-px"
              />
              <span className="os-ask-icon bg-sunken text-fg flex h-[52px] w-[52px] items-center justify-center rounded-[12px]">
                <Icon name={a.icon} size={28} />
              </span>
              <span className="font-display text-fg pt-[6px] text-[34px] leading-none font-semibold tracking-[-0.02em]">
                {a.title}
              </span>
              <p className="text-muted pt-[4px] text-[25px] leading-[1.36] text-pretty">
                {a.body}
              </p>
            </li>
          ))}
        </ul>

        {/* The code and the repository, centred in the right-hand column. */}
        <div
          className="absolute flex flex-col items-center"
          style={{
            left: RIGHT_X,
            width: RIGHT_W,
            top: SAFE.top,
            bottom: SAFE.bottom,
          }}
        >
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-8">
            <Bezel
              className="os-qr-card w-full"
              coreStyle={{ background: "#ffffff" }}
            >
              <div className="relative mx-auto w-fit px-7 pt-7">
                <svg
                  width={QR_PX}
                  height={QR_PX}
                  viewBox={`0 0 ${qr.total} ${qr.total}`}
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label={`QR code for ${repoUrl}`}
                  className="block"
                >
                  <rect width={qr.total} height={qr.total} fill="#ffffff" />
                  {qr.rows.map((d, r) => (
                    <path key={r} className="os-qr-row" d={d} fill="#10141b" />
                  ))}
                </svg>
                <span
                  aria-hidden
                  className="os-scan pointer-events-none absolute inset-x-7 top-7 h-[3px] rounded-full opacity-0"
                  style={{ background: "#c8305f" }}
                />
              </div>
              <div className="flex items-center justify-center gap-3 pt-1 pb-7 text-[#353d4a]">
                <Icon name="link" size={26} />
                <span className="t-mono text-[23px] font-medium">
                  {repoLabel}
                </span>
              </div>
            </Bezel>

            <Card className="os-repo w-full px-9 py-7">
              <div className="flex items-center gap-4">
                <span className="text-muted inline-flex">
                  <Icon name="book" size={32} />
                </span>
                <span className="font-display min-w-0 truncate text-[32px] leading-none tracking-[-0.02em]">
                  <span className="text-muted font-medium">{owner}</span>
                  <span className="text-faint mx-2">/</span>
                  <span className="text-fg font-semibold">{repo}</span>
                </span>
                <Chip size={20} className="ml-auto shrink-0">
                  Public
                </Chip>
              </div>
              <p className="text-body mt-4 text-[25px] leading-[1.35]">
                {description}
              </p>
              <div className="text-muted mt-5 flex items-center gap-7 text-[23px]">
                <span className="inline-flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="bg-faint inline-block h-[14px] w-[14px] rounded-full"
                  />
                  {language.name}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Icon name="star" size={24} />
                  <span className="tabular">{stars ?? <Ph>48</Ph>}</span>
                </span>
                <span className="ml-auto inline-flex items-center gap-2">
                  <Icon name="heart" size={24} />
                  Open source
                </span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The QR code for `text`, one SVG path per row of modules so it can print in
 * row by row, with a four-module quiet zone all round (the size the standard
 * asks for). Coordinates are in modules; the SVG scales them.
 */
function qrRows(text: string): { rows: string[]; total: number } {
  const QUIET = 4;
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = modules.size;
  const rows: string[] = [];
  for (let r = 0; r < size; r++) {
    let d = "";
    let c = 0;
    while (c < size) {
      if (!modules.data[r * size + c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < size && modules.data[r * size + c]) c++;
      d += `M${start + QUIET} ${r + QUIET}h${c - start}v1h-${c - start}z`;
    }
    rows.push(d);
  }
  return { rows, total: size + QUIET * 2 };
}

/** "github.com/paraswtf/plannr" to ["paraswtf", "plannr"]. */
function splitRepo(label: string): [string, string] {
  const parts = label
    .replace(/^https?:\/\//, "")
    .split("/")
    .filter(Boolean);
  const repo = parts[parts.length - 1] ?? label;
  const owner = parts[parts.length - 2] ?? "";
  return [owner, repo];
}
