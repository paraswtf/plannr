import type { ReactNode } from "react";

import { Ph } from "~/ui/placeholder";

import { share, type Tally } from "./types";

/*
 * The research, and the one switch that projects it.
 *
 * What we have so far is a first round: 15 students who answered four open
 * questions and 11 who took a survey, 10 faculty across SICSR and SIG, and 4
 * coordinators. The deck shows every head count as collected: PROJECTION is
 * 1. Set it higher to preview the slides with a bigger sample: every head
 * count and sample size is then multiplied by it and marked as a placeholder
 * (dashed amber, hidden with H), so it is never presented as collected by
 * accident. A share ("73%") is the same either way, so shares are real and
 * shown plain. The speaker notes are written out by hand and do not follow
 * the switch: they say the numbers as collected.
 *
 * Only head counts are projected: not the number of tools, institutes, days,
 * years, scale points or severities.
 *
 * The section files keep the numbers as collected. When the second round is
 * in, put its real tallies there: every chart, count and mark follows.
 *
 * A tally marked `placeholder` has no research behind it at all (the admins',
 * whose section is out of scope and not presented). It is shown as it is,
 * never projected, and always marked.
 */
export const PROJECTION = 1 as number;

const PLACEHOLDER_NOTE = "Placeholder: no research behind this yet";

/** A collected head count, as the deck shows it. */
export function projectedCount(n: number, placeholder = false) {
  return placeholder ? n : n * PROJECTION;
}

/**
 * A head count as shown on a slide: projected and marked while the deck
 * projects, plain once it does not. A `placeholder` count is shown as it is
 * and always marked.
 */
export function Projected({
  n,
  placeholder = false,
}: {
  /** The count as collected. */
  n: number;
  placeholder?: boolean;
}): ReactNode {
  if (placeholder) return <Ph note={PLACEHOLDER_NOTE}>{n}</Ph>;
  if (PROJECTION === 1) return n;
  return (
    <Ph note={`Projected: ${PROJECTION}× the ${n} we have so far`}>
      {n * PROJECTION}
    </Ph>
  );
}

/** A share as a whole percentage: "73%". */
export function pct(t: Tally) {
  return `${Math.round(share(t) * 100)}%`;
}

/** A share as shown on a slide: plain, or marked when it is a placeholder. */
export function Pct({ t }: { t: Tally }): ReactNode {
  return t.placeholder ? <Ph note={PLACEHOLDER_NOTE}>{pct(t)}</Ph> : pct(t);
}

/** "8 of 11": a tally's count of its sample, both as shown. */
export function Of({ t }: { t: Tally }): ReactNode {
  return (
    <>
      <Projected n={t.count} placeholder={t.placeholder} /> of{" "}
      <Projected n={t.of} placeholder={t.placeholder} />
    </>
  );
}

/** The same as plain text, for titles, notes and tooltips: "8 of 11". */
export function ofText(t: Tally) {
  return `${projectedCount(t.count, t.placeholder)} of ${projectedCount(t.of, t.placeholder)}`;
}

/**
 * A number worked out from placeholder data (a score, say): marked when
 * `placeholder`, plain otherwise.
 */
export function Derived({
  children,
  placeholder = false,
}: {
  children: ReactNode;
  placeholder?: boolean;
}): ReactNode {
  return placeholder ? <Ph note={PLACEHOLDER_NOTE}>{children}</Ph> : children;
}
