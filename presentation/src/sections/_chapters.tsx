import type { ReactNode } from "react";

import {
  rankProblems,
  type Evidence,
  type Feature,
  type Problem,
  type TrackStatus,
} from "~/content/types";
import type { SlideDef, StakeholderId } from "~/deck/types";
import { FeatureShowcase } from "~/templates/FeatureShowcase";
import { ProblemTrack } from "~/templates/ProblemTrack";

/*
 * A section's answers, one at a time.
 *
 * After the ranking, a section does not show every feature at once. It walks
 * the ranked problems in chapters: back to the list, one or two problems lit
 * with the numbers behind them, then the feature that answers them (built, or
 * planned and marked so), then back to the list with those problems marked,
 * and so on. A recap closes the walk: every problem and where it stands.
 *
 * The problem rows, the ranking's cells and the feature's chips share the flip
 * id `${stakeholder}-problem-${id}`, so each problem travels from the list
 * into the feature that answers it, and back.
 */

export interface Chapter {
  /**
   * Used in the slide ids: `${stakeholder}-track-${id}` and
   * `${stakeholder}-feature-${id}`. Use new words, not ones in old slide ids.
   */
  id: string;
  /** The problems this chapter is about (one or two), in ranked order. */
  problems: string[];
  /**
   * How the feature leaves each of `problems`, when not the default (built
   * for a built feature, planned for a planned one): a built feature whose
   * real answer is its planned point leaves the problem "planned".
   */
  answers?: Partial<Record<string, "built" | "planned">>;
  /** The track slide's title: the insight, one line (about 34 characters). */
  title: ReactNode;
  /** The track slide's name in the overview and presenter view. */
  label: string;
  /** One or two numbers behind the problems. */
  evidence: Evidence[];
  /** One thing someone said about them (shown when there is one evidence row). */
  quote?: { text: ReactNode; who: ReactNode };
  /** What answers them. */
  feature: Feature;
  /** The demo beside the feature, given the slide's build. */
  visual: (p: { step: number; active: boolean; flipId: string }) => ReactNode;
  /** Which side the demo sits on. Default right. */
  side?: "left" | "right";
  /** The script: two builds on the track slide, one per point on the feature. */
  notes: { track: [string, string]; feature: string[] };
}

/** Where every problem stands before chapter `at` (or after all of them). */
export function trackStatus(
  problems: Problem[],
  chapters: Chapter[],
  at: number,
  { later = [], planned = [] }: { later?: string[]; planned?: string[] } = {},
): Record<string, TrackStatus> {
  const status: Record<string, TrackStatus> = {};
  for (const p of problems) status[p.id] = "todo";
  chapters.slice(0, at).forEach((ch) => {
    const fallback = ch.feature.status === "planned" ? "planned" : "built";
    for (const id of ch.problems) {
      const mark = ch.answers?.[id] ?? fallback;
      // Built wins: a problem something built answered stays built.
      if (status[id] !== "built") status[id] = mark;
    }
  });
  // Answered by no chapter, but by something we plan (shown once the walk
  // is over, in the recap).
  if (at >= chapters.length) {
    for (const id of planned) if (status[id] === "todo") status[id] = "planned";
  }
  for (const id of later) status[id] = "later";
  const current = chapters[at];
  if (current) for (const id of current.problems) status[id] = "current";
  return status;
}

export function chapterSlides({
  stakeholder,
  problems,
  chapters,
  recap,
  later = [],
  planned = [],
}: {
  stakeholder: StakeholderId;
  /** All of the section's problems: the ranking's set. */
  problems: Problem[];
  chapters: Chapter[];
  recap: { title: ReactNode; label?: string; notes: string };
  /** Problems we leave for later (future scope): marked "Later". */
  later?: string[];
  /** Problems no chapter takes on that a planned feature will: "Planned" in the recap. */
  planned?: string[];
}): SlideDef[] {
  const ranked = rankProblems(problems);
  const known = new Set(problems.map((p) => p.id));
  const seen = new Set<string>();

  // Authoring mistakes fail loudly, like a duplicate slide id does.
  for (const ch of chapters) {
    const where = `${stakeholder} chapter "${ch.id}"`;
    if (ch.problems.length < 1 || ch.problems.length > 2)
      throw new Error(`${where}: take on one or two problems`);
    for (const id of ch.problems) {
      if (!known.has(id)) throw new Error(`${where}: no problem "${id}"`);
      if (seen.has(id)) throw new Error(`${where}: "${id}" is in two chapters`);
      seen.add(id);
    }
    if (ch.notes.feature.length !== ch.feature.points.length)
      throw new Error(`${where}: one note per point`);
  }
  for (const id of [...later, ...planned])
    if (!known.has(id)) throw new Error(`${stakeholder}: no problem "${id}"`);

  const slides = chapters.flatMap((ch, i): SlideDef[] => {
    const status = trackStatus(problems, chapters, i, { later, planned });
    const fresh = i > 0 ? chapters[i - 1]!.problems : [];
    const chips = ranked.filter((p) => ch.problems.includes(p.id));
    return [
      {
        id: `${stakeholder}-track-${ch.id}`,
        title: ch.label,
        steps: 2,
        notes: ch.notes.track,
        render: ({ step, active }) => (
          <ProblemTrack
            stakeholder={stakeholder}
            title={ch.title}
            problems={ranked}
            status={status}
            fresh={fresh}
            evidence={ch.evidence}
            quote={ch.quote}
            step={step}
            active={active}
          />
        ),
      },
      {
        id: `${stakeholder}-feature-${ch.id}`,
        title: ch.feature.name,
        steps: ch.feature.points.length,
        notes: ch.notes.feature,
        render: ({ step, active }) => (
          <FeatureShowcase
            stakeholder={stakeholder}
            feature={ch.feature}
            number={i + 1}
            solves={chips}
            side={ch.side}
            visual={ch.visual({
              step,
              active,
              flipId: `${stakeholder}-device`,
            })}
            step={step}
          />
        ),
      },
    ];
  });

  const last = chapters[chapters.length - 1];
  slides.push({
    id: `${stakeholder}-recap`,
    title: recap.label ?? "Where that leaves us",
    notes: recap.notes,
    render: ({ step, active }) => (
      <ProblemTrack
        stakeholder={stakeholder}
        title={recap.title}
        problems={ranked}
        status={trackStatus(problems, chapters, chapters.length, {
          later,
          planned,
        })}
        fresh={last ? last.problems : []}
        step={step}
        active={active}
      />
    ),
  });
  return slides;
}
