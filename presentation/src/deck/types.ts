import type { ReactNode } from "react";

export type SpeakerId = "paras" | "sonal" | "ravya" | "tanisha";
export type StakeholderId = "students" | "faculty" | "coordinators" | "admins";
export type SectionId = "opening" | "approach" | StakeholderId | "closing";
export type Theme = "dark" | "light";

/** What every slide is rendered with. */
export interface SlideProps {
  /** The build on screen, from 0 to `steps - 1`. */
  step: number;
  /**
   * False while the slide is on its way out, and in the presenter's preview of
   * the next slide. Loops and auto-playing demos should wait for it.
   */
  active: boolean;
}

/** One slide, as an author writes it in a section file. */
export interface SlideDef {
  /** Stable and unique: it is the URL (`#students-ranking/2`). */
  id: string;
  /** Short name for the overview and the presenter view. */
  title: string;
  /**
   * How many states the slide steps through before the next slide. 1 (the
   * default) means it has no builds.
   */
  steps?: number;
  /**
   * The speaker's script. Give one string per step to have the presenter view
   * follow along, or one string for the whole slide.
   */
  notes: string | string[];
  /** Defaults to "dark". */
  theme?: Theme;
  /** Show the deck's top bar and progress line. Defaults to true. */
  chrome?: boolean;
  /** Who is talking, when it is not the section's speaker. */
  speaker?: SpeakerId;
  render: (props: SlideProps) => ReactNode;
}

export interface SectionDef {
  id: SectionId;
  /** Shown in the top bar and the overview, e.g. "Students". */
  title: string;
  speaker: SpeakerId;
  slides: SlideDef[];
}

/** A slide with everything the engine needs resolved. */
export interface DeckSlide extends Omit<
  SlideDef,
  "steps" | "theme" | "chrome" | "speaker" | "notes"
> {
  index: number;
  steps: number;
  theme: Theme;
  chrome: boolean;
  speaker: SpeakerId;
  section: Omit<SectionDef, "slides">;
  /** Section number among the sections, for the "02 · Students" label. */
  sectionIndex: number;
  /** One entry per step; a single-string script is repeated. */
  notes: string[];
}

export function resolveDeck(sections: SectionDef[]): DeckSlide[] {
  const slides: DeckSlide[] = [];
  const seen = new Set<string>();
  sections.forEach(({ slides: defs, ...section }, sectionIndex) => {
    for (const def of defs) {
      if (seen.has(def.id)) throw new Error(`Duplicate slide id: ${def.id}`);
      seen.add(def.id);
      const steps = Math.max(1, def.steps ?? 1);
      const notes =
        typeof def.notes === "string"
          ? [def.notes]
          : def.notes.length > 0
            ? def.notes
            : [""];
      slides.push({
        ...def,
        index: slides.length,
        steps,
        theme: def.theme ?? "dark",
        chrome: def.chrome ?? true,
        speaker: def.speaker ?? section.speaker,
        section,
        sectionIndex,
        notes,
      });
    }
  });
  return slides;
}
