"use client";

import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/**
 * A 1920 × 1080 canvas, scaled to fit whatever box it is put in.
 *
 * Slides are laid out in canvas pixels and never think about the screen. The
 * scale is a transform on the canvas, which GSAP Flip measures through, so a
 * morph lands in the same place at any window size.
 */
export const ScaledCanvas = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    canvasClassName?: string;
  }
>(function ScaledCanvas({ children, className, style, canvasClassName }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      setScale(Math.min(width / CANVAS_W, height / CANVAS_H));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      className={`relative overflow-hidden ${className ?? ""}`}
      style={style}
    >
      <div
        ref={ref}
        className={`absolute top-1/2 left-1/2 ${canvasClassName ?? ""}`}
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
});
