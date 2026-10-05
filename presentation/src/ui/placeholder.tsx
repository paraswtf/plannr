"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import { Icon } from "./icon";

/**
 * Copy the team has not written yet.
 *
 * Renders the text as given, underlined in dashed amber so a placeholder can
 * never be presented by accident. Press `H` in the deck to hide the marks for
 * a rehearsal. When the real line is ready, delete the <Ph> around it.
 */
export function Ph({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <span
      className="ph"
      title={note ?? "Placeholder — replace before presenting"}
    >
      {children}
    </span>
  );
}

/**
 * A picture, or a labelled hole where one goes.
 *
 * With `src`, it is just the image. Without one — or if the file is not there
 * yet — it draws a dashed frame saying what belongs there ("Photo: students
 * outside the lab, 8:55am"), so the slide's layout is final before anybody
 * has the photo.
 */
export function ImageSlot({
  src,
  alt = "",
  label,
  credit,
  fit = "cover",
  position,
  className,
  style,
  radius = 24,
  flipId,
}: {
  src?: string;
  alt?: string;
  /** What should go here, shown while there is no picture. */
  label: string;
  /** Shown small over the image's corner; needed for CC-BY images. */
  credit?: string;
  fit?: "cover" | "contain";
  /** CSS object-position, e.g. "50% 20%" to keep a face in frame. */
  position?: string;
  className?: string;
  style?: CSSProperties;
  radius?: number;
  flipId?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const shown = src && failed !== src ? src : undefined;
  return (
    <div
      data-flip-id={flipId}
      className={`relative overflow-hidden ${shown ? "" : "ph-box bg-raised"} ${className ?? ""}`}
      style={{ borderRadius: radius, ...style }}
    >
      {shown ? (
        // A plain <img>: the deck is a static export with images served as-is.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shown}
          alt={alt}
          onError={() => setFailed(shown)}
          className="absolute inset-0 h-full w-full"
          style={{ objectFit: fit, objectPosition: position }}
        />
      ) : (
        <div className="text-muted absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <Icon name="image" size={44} stroke={1.5} />
          <span className="t-small max-w-[30ch]">{label}</span>
        </div>
      )}
      {shown && credit && (
        <span className="t-mono absolute right-3 bottom-3 rounded-md bg-black/55 px-2 py-1 text-[13px] text-white/80">
          {credit}
        </span>
      )}
    </div>
  );
}
