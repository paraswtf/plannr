import { isValidElement, type ReactNode } from "react";

/*
 * Pure layout maths for the research templates (DayTimeline above all): how
 * wide a label will be, and where to put labels along a line so that none of
 * them ever overlap. No DOM, so a slide lays out the same on the server, in a
 * snapshot and in the room.
 */

/** The plain text inside a ReactNode, including inside <Ph> and friends. */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node))
    return textOf(node.props.children);
  return "";
}

/**
 * A slightly generous guess at how wide a line of text is on the canvas.
 * Instrument Sans averages about half an em a character; JetBrains Mono is
 * exactly 0.6em. Generous on purpose: a guess that is too wide costs a little
 * air, one that is too narrow costs an overlap.
 */
export function textWidth(
  text: string,
  fontPx: number,
  face: "sans" | "mono" | "display" = "sans",
) {
  if (face === "mono") return text.length * fontPx * 0.6;
  let em = 0;
  for (const ch of text) {
    if (ch === " ") em += 0.27;
    else if ("iljtfr.,;:'’!|I“”\"".includes(ch)) em += 0.3;
    else if ("mwMW—".includes(ch)) em += 0.82;
    else if (ch >= "A" && ch <= "Z") em += 0.64;
    else em += 0.52;
  }
  return em * fontPx * (face === "display" ? 1.04 : 1);
}

/** "HH:MM" → hours as a number. */
export function hoursOf(at: string) {
  const [h = 0, m = 0] = at.split(":").map(Number);
  return h + m / 60;
}

/**
 * When a sine.inOut sweep reaches fraction `p` of its distance, as a fraction
 * of its duration. Lets things pop exactly as an eased playhead passes them.
 */
export function sineInOutTimeAt(p: number) {
  const c = Math.min(1, Math.max(0, p));
  return Math.acos(1 - 2 * c) / Math.PI;
}

export interface LabelItem {
  /** Where the event really is, in track pixels. */
  x: number;
  /** The label's width, in canvas pixels. */
  w: number;
}

export interface PlacedLabel {
  /** Where the dot is drawn: x, nudged apart from close neighbours. */
  dot: number;
  /** -1 above the line, 1 below, 0 on the line itself beside the dot. */
  side: -1 | 0 | 1;
  /** 0 next to the line; 1 a row further out, on a stem. */
  tier: number;
  /** The label's left edge, in track pixels. */
  left: number;
  width: number;
  /**
   * The label sits beside its dot rather than over it: draw a leader from
   * the dot to this x (the label's nearer edge). Null when it covers the dot.
   */
  leader: number | null;
  /** True if no clean place was found (the caller may warn). */
  forced: boolean;
}

export interface LaneLayoutOptions {
  /** Dot diameter. */
  dot: number;
  /** Space between neighbouring dots. */
  dotGap: number;
  /** How many rows of labels each side may use. */
  tiers: number;
  /** Bounds the labels must stay inside. */
  min: number;
  max: number;
  /** Space between two labels in a row. */
  gap: number;
  /** How far a label may sit beside its dot, on a leader. Default 150. */
  reach?: number;
}

interface Option {
  side: -1 | 0 | 1;
  tier: number;
  s: number;
  cost: number;
}

interface Taken {
  side: -1 | 0 | 1;
  tier: number;
  /** Everything the label occupies in its row: itself and its leader. */
  a: number;
  b: number;
  /** Its dot's x, where a stem to an outer row runs. */
  stem: number;
}

/**
 * Lay out one lane's events so that no two labels ever touch.
 *
 * Dots are spread just enough not to overlap. Each label then goes above or
 * below the line (alternating where it can), slid sideways as far as it can
 * while still sitting over its own dot; failing that, on the line itself
 * beside the dot, or beside the dot on a short leader, or on an outer row on
 * a stem when the lane is tall enough. A small search picks the arrangement
 * with the least of all that across the whole lane, so an early label can make
 * room for a later one.
 */
export function layoutLane(
  items: LabelItem[],
  o: LaneLayoutOptions,
): PlacedLabel[] {
  const reach = o.reach ?? 150;
  const r = o.dot / 2;
  const dots = spreadDots(
    items.map((i) => i.x),
    o.dot + o.dotGap,
    o.min + r,
    o.max - r,
  );

  const optionsFor = (
    idx: number,
    taken: Taken[],
    prevSide: number,
  ): Option[] => {
    const x = dots[idx]!;
    const w = items[idx]!.w;
    const ideal = x - w / 2;
    const opts: Option[] = [];

    // Above and below, on each tier.
    for (let tier = 0; tier < o.tiers; tier++) {
      for (const side of [-1, 1] as const) {
        const sameSide = taken.filter((t) => t.side === side);
        if (
          tier > 0 &&
          sameSide.some((t) => t.tier < tier && x >= t.a - 10 && x <= t.b + 10)
        )
          continue;
        const row = sameSide.filter((t) => t.tier === tier);
        const stems = sameSide.filter((t) => t.tier > tier).map((t) => t.stem);
        const sMin = Math.max(o.min, x - r - 10 - w - reach);
        const sMax = Math.min(o.max - w, x + r + 10 + reach);
        const ok = (sv: number) => {
          if (sv < sMin - 0.5 || sv > sMax + 0.5) return false;
          const a = Math.min(sv, x - 4);
          const b = Math.max(sv + w, x + 4);
          if (row.some((t) => a < t.b + o.gap && b > t.a - o.gap)) return false;
          if (stems.some((st) => st > a - 10 && st < b + 10)) return false;
          return true;
        };
        const cost = (sv: number) => {
          const off = Math.max(0, sv - (x - r)) + Math.max(0, x + r - (sv + w));
          return (
            tier * 700 +
            (side === prevSide ? 60 : 0) +
            (off > 0 ? 300 + off * 4 : 0) +
            Math.abs(sv - ideal)
          );
        };
        let best: Option | null = null;
        const cands = [ideal, x - r, x + r - w, x + r + 10, x - r - 10 - w];
        for (const t of row) cands.push(t.b + o.gap, t.a - o.gap - w);
        for (let sv = sMin; sv <= sMax; sv += 6) cands.push(sv);
        for (const raw of cands) {
          const sv = Math.min(sMax, Math.max(sMin, raw));
          if (!ok(sv)) continue;
          const c = cost(sv);
          if (!best || c < best.cost) best = { side, tier, s: sv, cost: c };
        }
        if (best) opts.push(best);
      }
    }

    // On the line, just right or just left of the dot, clear of other dots.
    const row = taken.filter((t) => t.side === 0);
    for (const sv of [x + r + 12, x - r - 12 - w]) {
      if (sv < o.min || sv + w > o.max) continue;
      const clearOfDots = dots.every(
        (d, j) => j === idx || d + r + 10 < sv || d - r - 10 > sv + w,
      );
      const clearOfRow = row.every(
        (t) => sv + w + o.gap <= t.a || sv >= t.b + o.gap,
      );
      if (clearOfDots && clearOfRow) {
        opts.push({ side: 0, tier: 0, s: sv, cost: 180 + (sv < x ? 20 : 0) });
      }
    }
    return opts.sort((p, q) => p.cost - q.cost);
  };

  let bestTotal = Infinity;
  let bestPlan: Option[] | null = null;
  const plan: Option[] = [];
  const taken: Taken[] = [];
  let budget = 40000;

  const search = (idx: number, total: number, prevSide: number) => {
    if (total >= bestTotal || budget-- <= 0) return;
    if (idx === items.length) {
      bestTotal = total;
      bestPlan = [...plan];
      return;
    }
    const x = dots[idx]!;
    for (const opt of optionsFor(idx, taken, prevSide)) {
      const w = items[idx]!.w;
      plan.push(opt);
      taken.push({
        side: opt.side,
        tier: opt.tier,
        a: opt.side === 0 ? opt.s : Math.min(opt.s, x - 4),
        b: opt.side === 0 ? opt.s + w : Math.max(opt.s + w, x + 4),
        stem: x,
      });
      search(idx + 1, total + opt.cost, opt.side === 0 ? prevSide : opt.side);
      plan.pop();
      taken.pop();
    }
  };
  search(0, 0, 1);

  const chosen: (Option | undefined)[] = bestPlan ?? [];
  return items.map((item, idx) => {
    const x = dots[idx]!;
    const opt = chosen[idx];
    if (!opt) {
      const s = Math.min(Math.max(x - item.w / 2, o.min), o.max - item.w);
      return {
        dot: x,
        side: idx % 2 ? 1 : -1,
        tier: 0,
        left: s,
        width: item.w,
        leader: null,
        forced: true,
      };
    }
    const s = opt.s;
    const leader =
      opt.side === 0
        ? null
        : s > x - r + 0.5
          ? s
          : s + item.w < x + r - 0.5
            ? s + item.w
            : null;
    return {
      dot: x,
      side: opt.side,
      tier: opt.tier,
      left: s,
      width: item.w,
      leader,
      forced: false,
    };
  });
}

/** Push dots apart so neighbours are at least `space` apart, keeping order. */
function spreadDots(
  xs: number[],
  space: number,
  min: number,
  max: number,
): number[] {
  type Cluster = { members: number[]; truth: number[] };
  const clusters: Cluster[] = [];
  const posOf = (c: Cluster) => {
    const mean = c.truth.reduce((s, v) => s + v, 0) / c.truth.length;
    const span = (c.truth.length - 1) * space;
    let start = mean - span / 2;
    start = Math.max(min, Math.min(max - span, start));
    return c.truth.map((_, j) => start + j * space);
  };
  xs.forEach((x, i) => {
    clusters.push({ members: [i], truth: [x] });
    // Merge backwards while the newest cluster crowds the one before.
    while (clusters.length > 1) {
      const last = clusters[clusters.length - 1]!;
      const prev = clusters[clusters.length - 2]!;
      const lastStart = posOf(last)[0]!;
      const prevEnd = posOf(prev).at(-1)!;
      if (lastStart - prevEnd >= space - 0.5) break;
      clusters.splice(clusters.length - 2, 2, {
        members: [...prev.members, ...last.members],
        truth: [...prev.truth, ...last.truth],
      });
    }
  });
  const out = new Array<number>(xs.length);
  for (const c of clusters) {
    const pos = posOf(c);
    c.members.forEach((m, j) => (out[m] = pos[j]!));
  }
  return out;
}
