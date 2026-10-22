"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { STAKEHOLDERS, TEAM } from "~/content/team";
import { Avatar } from "~/ui/people";

import {
  formatHash,
  parseHash,
  useDeckChannel,
  type DeckMessage,
} from "./channel";
import { NotesText, StepDots } from "./overlays";
import { DeckRuntimeProvider } from "./runtime";
import { ScaledCanvas } from "./ScaledCanvas";
import { SlideFrame } from "./SlideFrame";
import { THEME_BG, type DeckSlide } from "./types";

/**
 * The speaker's window: the slide on screen, what comes next, the script,
 * and two clocks — the whole talk's, and the current speaker's.
 *
 * Open it with `P` from the deck (it follows and drives the deck through a
 * BroadcastChannel), or on its own at /presenter to rehearse.
 */
export function Presenter({ slides }: { slides: DeckSlide[] }) {
  // Clocks and the URL are the browser's business: render nothing on the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <PresenterView slides={slides} /> : null;
}

function PresenterView({ slides }: { slides: DeckSlide[] }) {
  const [pos, setPos] = useState<{ index: number; step: number }>({
    index: 0,
    step: 0,
  });
  const [linked, setLinked] = useState(false);
  const started = useRef<number | null>(null);
  const speakerSince = useRef<{ speaker: string; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const post = useDeckChannel((message: DeckMessage) => {
    if (message.type === "state") {
      setLinked(true);
      setPos({ index: message.index, step: message.step });
    }
  });

  useEffect(() => {
    const target = parseHash(window.location.hash);
    const slide = target ? slides.find((s) => s.id === target.id) : undefined;
    if (slide)
      setPos({
        index: slide.index,
        step: Math.min(target!.step, slide.steps - 1),
      });
    post({ type: "hello" });
  }, [post, slides]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const slide = slides[pos.index]!;
  useEffect(() => {
    window.history.replaceState(null, "", formatHash(slide.id, pos.step));
  }, [slide.id, pos.step]);

  if (speakerSince.current?.speaker !== slide.speaker) {
    speakerSince.current = { speaker: slide.speaker, at: Date.now() };
  }

  const move = useCallback(
    (direction: 1 | -1) => {
      started.current ??= Date.now();
      if (linked) {
        post({ type: direction === 1 ? "next" : "prev" });
        return;
      }
      setPos(({ index, step }) => {
        const s = slides[index]!;
        if (direction === 1) {
          if (step < s.steps - 1) return { index, step: step + 1 };
          return index < slides.length - 1
            ? { index: index + 1, step: 0 }
            : { index, step };
        }
        if (step > 0) return { index, step: step - 1 };
        return index > 0
          ? { index: index - 1, step: slides[index - 1]!.steps - 1 }
          : { index, step };
      });
    },
    [linked, post, slides],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)
      ) {
        e.preventDefault();
        move(1);
      } else if (
        ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)
      ) {
        e.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  const upcoming =
    pos.step < slide.steps - 1
      ? { slide, step: pos.step + 1, label: "Next build" }
      : slides[pos.index + 1]
        ? { slide: slides[pos.index + 1]!, step: 0, label: "Next slide" }
        : null;

  const owner =
    slide.section.id in STAKEHOLDERS
      ? STAKEHOLDERS[slide.section.id as keyof typeof STAKEHOLDERS]
      : null;

  return (
    <div className="fixed inset-0 grid grid-cols-[minmax(0,1.35fr)_minmax(380px,1fr)] grid-rows-[auto_minmax(0,1fr)] gap-5 bg-[#0a0e13] p-5 text-white">
      <header className="col-span-2 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Avatar person={slide.speaker} size={44} />
          <div>
            <div className="font-display text-[22px] font-bold tracking-[-0.01em]">
              {TEAM[slide.speaker].name}
              <span className="text-white/45"> · {slide.section.title}</span>
            </div>
            <div className="t-mono text-[13px] text-white/50">
              Slide {slide.index + 1} of {slides.length} · {slide.title}
              {owner && owner.title !== slide.title ? ` · ${owner.title}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-7">
          <Clock
            label="Talk"
            ms={started.current ? now - started.current : 0}
          />
          <Clock
            label={`${TEAM[slide.speaker].name}'s part`}
            ms={started.current ? now - speakerSince.current.at : 0}
          />
          <Clock
            label="Time"
            text={new Date(now).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
          <button
            type="button"
            className="t-mono cursor-pointer rounded-lg bg-white/[0.06] px-3 py-2 text-[12px] text-white/70 hover:bg-white/10"
            onClick={() => {
              started.current = Date.now();
              speakerSince.current = { speaker: slide.speaker, at: Date.now() };
              setNow(Date.now());
            }}
          >
            Reset clocks
          </button>
          <span
            className="t-mono rounded-full px-3 py-1.5 text-[12px]"
            style={{
              background: linked
                ? "rgba(124,196,106,0.14)"
                : "rgba(246,167,59,0.14)",
              color: linked ? "#7cc46a" : "#f6a73b",
            }}
          >
            {linked ? "Following the deck" : "Standalone"}
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-col gap-4">
        <DeckRuntimeProvider value={{ instant: false }}>
          <ScaledCanvas
            className="w-full flex-[3] rounded-xl"
            style={{
              background: THEME_BG[slide.theme],
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)",
            }}
          >
            <SlideFrame key={slide.id} slide={slide} step={pos.step} active />
          </ScaledCanvas>
        </DeckRuntimeProvider>
        <div className="flex min-h-0 flex-[1.4] gap-4">
          {upcoming ? (
            <>
              <DeckRuntimeProvider value={{ instant: true }}>
                <ScaledCanvas
                  className="aspect-video h-full rounded-lg"
                  style={{
                    background: THEME_BG[upcoming.slide.theme],
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)",
                  }}
                >
                  <SlideFrame
                    key={`${upcoming.slide.id}/${upcoming.step}`}
                    slide={upcoming.slide}
                    step={upcoming.step}
                    active={false}
                  />
                </ScaledCanvas>
              </DeckRuntimeProvider>
              <div className="min-w-0 pt-1">
                <div className="t-mono text-[12px] tracking-[0.12em] text-white/45 uppercase">
                  {upcoming.label}
                </div>
                <div className="font-display mt-1 text-[20px] font-semibold">
                  {upcoming.slide.title}
                </div>
                {upcoming.slide.speaker !== slide.speaker && (
                  <div className="mt-2 flex items-center gap-2 text-[14px] text-white/70">
                    <Avatar person={upcoming.slide.speaker} size={22} />
                    Hand over to{" "}
                    {TEAM[upcoming.slide.speaker].name}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="t-mono text-white/40">End of the deck.</div>
          )}
        </div>
      </main>

      <aside
        className="flex min-h-0 flex-col rounded-xl bg-white/[0.03] p-5"
        style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="t-mono text-[12px] tracking-[0.12em] text-white/45 uppercase">
            Script
          </span>
          <StepDots steps={slide.steps} step={pos.step} />
        </div>
        <NotesText
          slide={slide}
          step={pos.step}
          size={21}
          className="deck-scroll min-h-0 flex-1 overflow-y-auto pr-3"
        />
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => move(-1)}
            className="flex-1 cursor-pointer rounded-lg bg-white/[0.06] py-3 text-[15px] font-semibold hover:bg-white/10"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            className="flex-[2] cursor-pointer rounded-lg py-3 text-[15px] font-semibold text-white"
            style={{ background: "var(--grad-brand-h)" }}
          >
            Next →
          </button>
        </div>
      </aside>
    </div>
  );
}

function Clock({
  label,
  ms,
  text,
}: {
  label: string;
  ms?: number;
  text?: string;
}) {
  const value =
    text ??
    (() => {
      const total = Math.floor((ms ?? 0) / 1000);
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    })();
  return (
    <div className="text-right">
      <div className="t-mono text-[11px] tracking-[0.12em] text-white/40 uppercase">
        {label}
      </div>
      <div className="t-mono text-[22px] font-semibold">{value}</div>
    </div>
  );
}
