"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Chrome } from "./Chrome";
import {
  formatHash,
  parseHash,
  useDeckChannel,
  type DeckMessage,
} from "./channel";
import { gsap, useGSAP } from "./gsap";
import { captureMorph, runMorph, type MorphCapture } from "./morph";
import { HelpPanel, NotesPanel, Overview } from "./overlays";
import { DeckRuntimeProvider } from "./runtime";
import { ScaledCanvas } from "./ScaledCanvas";
import { SlideFrame } from "./SlideFrame";
import { THEME_BG, type DeckSlide } from "./types";

/** A slide on screen. `key` is new each time a slide arrives, so it remounts. */
interface Shown {
  index: number;
  step: number;
  key: number;
}

interface View {
  current: Shown;
  /** The slide fading out while `current` morphs in. */
  leaving: Shown | null;
}

type Panel = "overview" | "notes" | "help" | null;

declare global {
  interface Window {
    /** For scripts/snapshot.mjs and the browser console. */
    __deck?: {
      ready: boolean;
      slides: {
        id: string;
        index: number;
        steps: number;
        title: string;
        section: string;
        speaker: string;
      }[];
      go: (index: number, step?: number, instant?: boolean) => void;
      next: () => void;
      prev: () => void;
      state: () => { index: number; step: number } | null;
      transition: () => gsap.core.Timeline | null;
    };
  }
}

/**
 * The audience view: one slide at a time on a scaled 1920 × 1080 canvas,
 * morphing from each slide to the next.
 */
export function Deck({ slides }: { slides: DeckSlide[] }) {
  const [view, setViewState] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  const [panel, setPanel] = useState<Panel>(null);
  const [blackout, setBlackout] = useState(false);
  const [instant, setInstant] = useState(false);
  // Honour the system's "reduce motion": slides then dissolve instead of
  // travelling, and builds land at once. `M` (or ?motion=full) overrides it.
  const [reduced, setReduced] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const backdrop = useRef<HTMLDivElement>(null);
  const curtain = useRef<HTMLDivElement>(null);
  const chrome = useRef<HTMLDivElement>(null);
  const layers = useRef(new Map<number, HTMLDivElement>());
  const keys = useRef(1);
  const pending = useRef<{
    capture: MorphCapture | null;
    dissolve: boolean;
  } | null>(null);
  const transition = useRef<gsap.core.Timeline | null>(null);
  const opened = useRef(false);
  const toastEl = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(slides.map((s) => [s.id, s])), [slides]);

  const finish = useCallback(() => {
    transition.current?.progress(1);
  }, []);

  const go = useCallback(
    (index: number, step: number, opts?: { instant?: boolean }) => {
      const v = viewRef.current;
      if (!v) return;
      const i = clamp(index, 0, slides.length - 1);
      const s = clamp(step, 0, slides[i]!.steps - 1);
      if (v.current.index === i && v.current.step === s) return;

      finish();
      const settled = viewRef.current!;
      if (settled.current.index === i) {
        setView({ ...settled, current: { ...settled.current, step: s } });
        return;
      }

      const quick = opts?.instant ?? instant;
      const from = layers.current.get(settled.current.key);
      pending.current = quick
        ? null
        : {
            capture: reduced
              ? null
              : captureMorph(
                  [from, chrome.current].filter(
                    (el): el is HTMLDivElement => !!el,
                  ),
                ),
            dissolve: reduced,
          };
      setView({
        current: { index: i, step: s, key: keys.current++ },
        leaving: quick ? null : settled.current,
      });
    },
    [slides, finish, instant, reduced, setView],
  );

  const next = useCallback(() => {
    const c = viewRef.current?.current;
    if (!c) return;
    if (c.step < slides[c.index]!.steps - 1) go(c.index, c.step + 1);
    else go(c.index + 1, 0);
  }, [go, slides]);

  const prev = useCallback(() => {
    const c = viewRef.current?.current;
    if (!c) return;
    if (c.step > 0) go(c.index, c.step - 1);
    else if (c.index > 0) go(c.index - 1, slides[c.index - 1]!.steps - 1);
  }, [go, slides]);

  // Where to start: the URL's slide, or the first. Read once, on the client.
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const speed = Number(params.get("speed"));
    if (speed > 0) gsap.globalTimeline.timeScale(speed);
    if (params.has("instant")) setInstant(true);
    const motion = params.get("motion");
    setReduced(
      motion === "reduced" ||
        (motion !== "full" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    );
    if (params.get("placeholders") === "hidden") {
      document.documentElement.dataset.placeholders = "hidden";
    }
    const target = parseHash(window.location.hash);
    const start = target ? byId.get(target.id) : undefined;
    const index = start?.index ?? 0;
    const step = Math.min(target?.step ?? 0, slides[index]!.steps - 1);
    setView({ current: { index, step, key: keys.current++ }, leaving: null });
  }, [byId, slides, setView]);

  // Run the morph once React has both slides on the canvas.
  useLayoutEffect(() => {
    if (!view) return;
    const slide = slides[view.current.index]!;
    const job = pending.current;
    pending.current = null;
    const to = layers.current.get(view.current.key);
    const from = view.leaving
      ? layers.current.get(view.leaving.key)
      : undefined;

    if (!job || !from || !to) {
      gsap.set(backdrop.current, { backgroundColor: THEME_BG[slide.theme] });
      // The very first slide fades up rather than appearing at hydration.
      if (!opened.current && to) {
        opened.current = true;
        gsap.from(to, { autoAlpha: 0, duration: 0.8, ease: "power1.out" });
      }
      return;
    }
    const tl = runMorph({
      capture: job.capture,
      dissolve: job.dissolve,
      from,
      to,
      extraScopes: chrome.current ? [chrome.current] : [],
      onComplete: () => {
        transition.current = null;
        const v = viewRef.current;
        if (v?.leaving) setView({ ...v, leaving: null });
      },
    });
    tl.to(
      backdrop.current,
      {
        backgroundColor: THEME_BG[slide.theme],
        duration: 0.6,
        ease: "power1.inOut",
      },
      0,
    );
    transition.current = tl;
  }, [view, slides, setView]);

  // Keep the URL on the current slide, so a reload lands back here.
  useEffect(() => {
    if (!view) return;
    const slide = slides[view.current.index]!;
    const hash = formatHash(slide.id, view.current.step);
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [view, slides]);

  useEffect(() => {
    const onHash = () => {
      const target = parseHash(window.location.hash);
      const slide = target ? byId.get(target.id) : undefined;
      if (slide) go(slide.index, target!.step, { instant: true });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [byId, go]);

  // The presenter window drives us, and hears where we are.
  const post = useDeckChannel((message: DeckMessage) => {
    if (message.type === "next") next();
    else if (message.type === "prev") prev();
    else if (message.type === "go") go(message.index, message.step);
    else if (message.type === "hello" && viewRef.current) {
      const { index, step } = viewRef.current.current;
      post({ type: "state", index, step });
    }
  });
  useEffect(() => {
    if (view)
      post({
        type: "state",
        index: view.current.index,
        step: view.current.step,
      });
  }, [view, post]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      const c = viewRef.current?.current;
      if (!c) return;

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
        case "Enter":
          if (panel === "overview" || panel === "help") return;
          e.preventDefault();
          if (e.shiftKey) go(c.index + 1, 0);
          else next();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          if (panel === "overview" || panel === "help") return;
          e.preventDefault();
          if (e.shiftKey)
            go(Math.max(0, c.step > 0 ? c.index : c.index - 1), 0);
          else prev();
          break;
        case "Home":
          go(0, 0);
          break;
        case "End":
          go(slides.length - 1, 0);
          break;
        case "Escape":
          setPanel((p) => (p ? null : "overview"));
          break;
        case "o":
        case "O":
          setPanel((p) => (p === "overview" ? null : "overview"));
          break;
        case "n":
        case "N":
          setPanel((p) => (p === "notes" ? null : "notes"));
          break;
        case "?":
          setPanel((p) => (p === "help" ? null : "help"));
          break;
        case "p":
        case "P":
          window.open(
            new URL(
              `presenter${window.location.hash}`,
              window.location.href.replace(/[^/]*$/, ""),
            ).toString(),
            "plannr-presenter",
            "popup,width=1440,height=900",
          );
          break;
        case "f":
        case "F":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen();
          break;
        case "b":
        case "B":
        case ".":
          setBlackout((b) => !b);
          break;
        case "m":
        case "M":
          setReduced((r) => {
            setToast(r ? "Full motion" : "Reduced motion");
            return !r;
          });
          break;
        case "h":
        case "H": {
          const root = document.documentElement;
          root.dataset.placeholders =
            root.dataset.placeholders === "hidden" ? "" : "hidden";
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, next, prev, panel, slides.length]);

  // A swipe on a touch screen turns the page.
  useEffect(() => {
    let x0: number | null = null;
    const down = (e: TouchEvent) => (x0 = e.touches[0]?.clientX ?? null);
    const up = (e: TouchEvent) => {
      const x1 = e.changedTouches[0]?.clientX;
      if (x0 === null || x1 === undefined) return;
      if (x1 - x0 < -50) next();
      else if (x1 - x0 > 50) prev();
      x0 = null;
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchend", up);
    };
  }, [next, prev]);

  useEffect(() => {
    window.__deck = {
      ready: !!view,
      slides: slides.map((s) => ({
        id: s.id,
        index: s.index,
        steps: s.steps,
        title: s.title,
        section: s.section.id,
        speaker: s.speaker,
      })),
      go: (index, step = 0, quick = false) =>
        go(index, step, { instant: quick }),
      next,
      prev,
      state: () => {
        const c = viewRef.current?.current;
        return c ? { index: c.index, step: c.step } : null;
      },
      transition: () => transition.current,
    };
  }, [view, slides, go, next, prev]);

  useGSAP(
    () => {
      gsap.to(curtain.current, { autoAlpha: blackout ? 1 : 0, duration: 0.45 });
    },
    { dependencies: [blackout] },
  );

  useGSAP(
    () => {
      if (!toast) return;
      gsap
        .timeline({ onComplete: () => setToast(null) })
        .fromTo(
          toastEl.current,
          { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.25, ease: "power2.out" },
        )
        .to(toastEl.current, { autoAlpha: 0, duration: 0.3 }, "+=1.2");
    },
    { dependencies: [toast] },
  );

  const current = view ? slides[view.current.index]! : null;
  const shown: { s: Shown; active: boolean }[] = [];
  if (view?.leaving) shown.push({ s: view.leaving, active: false });
  if (view) shown.push({ s: view.current, active: true });

  return (
    <DeckRuntimeProvider value={{ instant: instant || reduced }}>
      <div
        ref={backdrop}
        className="fixed inset-0"
        style={{
          background: THEME_BG.light,
          cursor: panel ? "auto" : undefined,
        }}
      >
        <ScaledCanvas className="h-full w-full">
          {shown.map(({ s, active }) => (
            <SlideFrame
              key={s.key}
              ref={(el) => {
                if (el) layers.current.set(s.key, el);
                else layers.current.delete(s.key);
              }}
              slide={slides[s.index]!}
              step={s.step}
              active={active}
            />
          ))}
          {current && <Chrome ref={chrome} slide={current} slides={slides} />}
        </ScaledCanvas>

        <div aria-hidden className="deck-grain z-20" />
        <div
          ref={curtain}
          className="pointer-events-none invisible fixed inset-0 z-30 bg-black opacity-0"
        />
        {toast && (
          <div
            ref={toastEl}
            role="status"
            className="pointer-events-none invisible fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-[#10141b] px-4 py-2 text-[14px] font-medium text-white opacity-0"
          >
            {toast}
          </div>
        )}
      </div>

      {current && view && panel === "notes" && (
        <NotesPanel
          slide={current}
          step={view.current.step}
          next={slides[current.index + 1]}
        />
      )}
      {current && panel === "overview" && (
        <Overview
          slides={slides}
          current={current.index}
          onPick={(index) => {
            setPanel(null);
            go(index, 0);
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "help" && <HelpPanel onClose={() => setPanel(null)} />}
    </DeckRuntimeProvider>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
