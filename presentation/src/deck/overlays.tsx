"use client";

import { useEffect, useRef, useState } from "react";

import { STAKEHOLDERS, TEAM } from "~/content/team";
import { Avatar } from "~/ui/people";

import { sectionColor } from "./Chrome";
import { gsap, useGSAP } from "./gsap";
import { DeckRuntimeProvider } from "./runtime";
import { ScaledCanvas } from "./ScaledCanvas";
import { SlideFrame } from "./SlideFrame";
import { THEME_BG, type DeckSlide, type SectionId } from "./types";

/** Fades a panel in when it mounts. */
function usePanelIn() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    gsap.from(ref.current, {
      opacity: 0,
      y: 12,
      duration: 0.3,
      ease: "power2.out",
    });
  });
  return ref;
}

/**
 * A slide as a still, at its last build, the way the presenter's preview of
 * the next slide draws it (instant, inactive). It mounts only once it scrolls
 * near view, so opening the overview does not render the whole deck at once,
 * and it stays mounted after. Inert: the card around it takes the click.
 */
function SlideThumb({ slide }: { slide: DeckSlide }) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen]);

  return (
    <div
      ref={box}
      inert
      className="pointer-events-none aspect-video w-full overflow-hidden rounded-lg"
      style={{
        background: THEME_BG[slide.theme],
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      {seen && (
        <DeckRuntimeProvider value={{ instant: true }}>
          <ScaledCanvas className="h-full w-full">
            <SlideFrame
              slide={slide}
              step={Math.max(0, slide.steps - 1)}
              active={false}
            />
          </ScaledCanvas>
        </DeckRuntimeProvider>
      )}
    </div>
  );
}

/**
 * The whole deck on one screen, section by section, each slide as a preview —
 * the structure at a glance, and a way to jump anywhere. `O` or `Esc` opens
 * it.
 */
export function Overview({
  slides,
  current,
  onPick,
  onClose,
}: {
  slides: DeckSlide[];
  current: number;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const ref = usePanelIn();
  const sections: {
    id: SectionId;
    title: string;
    index: number;
    slides: DeckSlide[];
  }[] = [];
  for (const s of slides) {
    const last = sections[sections.length - 1];
    if (last?.id === s.section.id) last.slides.push(s);
    else
      sections.push({
        id: s.section.id,
        title: s.section.title,
        index: s.sectionIndex,
        slides: [s],
      });
  }

  return (
    <div
      ref={ref}
      data-theme="dark"
      className="deck-scroll fixed inset-0 z-50 overflow-y-auto bg-[rgba(10,14,19,0.94)] px-10 py-9 text-white backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="mx-auto max-w-[1500px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-8 flex items-baseline justify-between">
          <h2 className="font-display text-[30px] font-bold tracking-[-0.02em]">
            The deck, start to finish
          </h2>
          <span className="t-mono text-[13px] text-white/50">
            {slides.length} slides · click one to jump · Esc to close
          </span>
        </div>
        {sections.map((section) => {
          const color = sectionColor(section.id);
          const speakers = Array.from(
            new Set(section.slides.map((s) => s.speaker)),
          );
          return (
            <section key={section.id} className="mb-9">
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="h-[10px] w-[34px] rounded-full"
                  style={{ background: color }}
                />
                <span className="t-mono text-[13px] text-white/45">
                  {String(section.index).padStart(2, "0")}
                </span>
                <span className="font-display text-[19px] font-semibold">
                  {section.title}
                </span>
                <span className="flex items-center gap-2 text-[13px] text-white/55">
                  {speakers.map((p) => (
                    <span key={p} className="flex items-center gap-1.5">
                      <Avatar person={p} size={22} />
                      {TEAM[p].name}
                    </span>
                  ))}
                </span>
                {section.id in STAKEHOLDERS && (
                  <span className="t-mono text-[12px] text-white/35">
                    stakeholder section
                  </span>
                )}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {section.slides.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onPick(s.index)}
                    className="flex cursor-pointer flex-col rounded-xl bg-white/[0.04] p-2.5 text-left transition-colors hover:bg-white/[0.08]"
                    style={{
                      boxShadow:
                        s.index === current
                          ? `inset 0 0 0 2px ${color.startsWith("var(--grad") ? "#e8455e" : color}`
                          : "inset 0 0 0 1px rgba(255,255,255,0.08)",
                    }}
                  >
                    <SlideThumb slide={s} />
                    <span className="mt-2.5 flex items-center gap-2 px-1">
                      <span className="t-mono text-[12px] text-white/45">
                        {String(s.index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14.5px] leading-snug font-semibold">
                        {s.title}
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {Array.from({ length: s.steps }, (_, i) => (
                          <span
                            key={i}
                            className="h-[5px] w-[5px] rounded-full bg-white/30"
                          />
                        ))}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The script under the slide, for rehearsing on one screen. `N` toggles it.
 * The paragraph for the step on screen is lit; the rest are dimmed.
 */
export function NotesPanel({
  slide,
  step,
  next,
}: {
  slide: DeckSlide;
  step: number;
  next?: DeckSlide;
}) {
  const ref = usePanelIn();
  return (
    <div
      ref={ref}
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[42vh] gap-8 bg-[rgba(10,14,19,0.92)] px-10 py-6 text-white backdrop-blur-md"
      style={{ boxShadow: "0 -1px 0 rgba(255,255,255,0.1)" }}
    >
      <div className="w-[260px] shrink-0">
        <div className="flex items-center gap-3">
          <Avatar person={slide.speaker} size={36} />
          <div>
            <div className="font-display text-[18px] font-semibold">
              {TEAM[slide.speaker].name}
            </div>
            <div className="t-mono text-[12px] text-white/50">
              {slide.index + 1} · {slide.title}
            </div>
          </div>
        </div>
        <StepDots steps={slide.steps} step={step} className="mt-4" />
        {next && (
          <div className="mt-4 text-[12.5px] text-white/45">
            Next: <span className="text-white/75">{next.title}</span>
          </div>
        )}
      </div>
      <NotesText
        slide={slide}
        step={step}
        className="deck-scroll min-w-0 flex-1 overflow-y-auto pr-4"
      />
    </div>
  );
}

export function NotesText({
  slide,
  step,
  className,
  size = 17,
}: {
  slide: DeckSlide;
  step: number;
  className?: string;
  size?: number;
}) {
  const lit = Math.min(step, slide.notes.length - 1);
  return (
    <div className={className}>
      {slide.notes.map((paragraph, i) => (
        <p
          key={i}
          className="mb-3 leading-relaxed whitespace-pre-line transition-opacity"
          style={{
            fontSize: size,
            opacity: slide.notes.length === 1 || i === lit ? 1 : 0.38,
          }}
        >
          {slide.notes.length > 1 && (
            <span className="t-mono mr-2 text-[0.72em] text-white/40">
              {i + 1}/{slide.notes.length}
            </span>
          )}
          {paragraph}
        </p>
      ))}
    </div>
  );
}

export function StepDots({
  steps,
  step,
  className,
}: {
  steps: number;
  step: number;
  className?: string;
}) {
  if (steps <= 1) return null;
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      {Array.from({ length: steps }, (_, i) => (
        <span
          key={i}
          className="h-[7px] rounded-full transition-all"
          style={{
            width: i === step ? 20 : 7,
            background: i <= step ? "#ffffff" : "rgba(255,255,255,0.25)",
          }}
        />
      ))}
      <span className="t-mono ml-2 text-[12px] text-white/45">
        build {step + 1} of {steps}
      </span>
    </div>
  );
}

const KEYS: [string, string][] = [
  ["→  Space  PgDn", "Next build, then next slide"],
  ["←  PgUp", "Back a build"],
  ["⇧→  ⇧←", "Skip a slide's builds"],
  ["Home  End", "First, last slide"],
  ["O  Esc", "Overview of every slide"],
  ["N", "Speaker notes under the slide"],
  ["P", "Presenter view in a second window"],
  ["F", "Full screen"],
  ["B", "Black out the screen"],
  ["H", "Hide the placeholder marks"],
  ["M", "Reduced motion on or off"],
  ["?", "This list"],
];

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const ref = usePanelIn();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        ref={ref}
        className="w-[520px] rounded-2xl bg-[#151d28] p-7 text-white"
        style={{
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.1), 0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        <h2 className="font-display mb-5 text-[22px] font-bold">Keys</h2>
        <dl className="grid grid-cols-[170px_1fr] gap-x-4 gap-y-2.5 text-[14.5px]">
          {KEYS.map(([keys, what]) => (
            <div key={keys} className="contents">
              <dt className="t-mono text-white/70">{keys}</dt>
              <dd className="text-white/85">{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
