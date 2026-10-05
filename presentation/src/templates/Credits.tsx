"use client";

import { useRef, useState, type ReactNode } from "react";

import { STAKEHOLDERS, TEAM } from "~/content/team";
import type { SpeakerId } from "~/deck/types";
import { Icon } from "~/ui/icon";
import { Bezel } from "~/ui/frames";
import { SlideBody } from "~/ui/layout";
import { Avatar } from "~/ui/people";

import { useEntrance } from "./_closing-motion";

export interface CreditsProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  sponsor: {
    name: string;
    /** "Funded by Rivant, as part of its contribution to open source." */
    line: ReactNode;
    /** A sentence about the sponsor: "We build things people use." */
    about: ReactNode;
    /**
     * Path under public/, e.g. "/images/rivant-logo.svg". When omitted,
     * /images/<name>-logo.svg and then .png are tried; with neither there,
     * the sponsor's name is set as a wordmark on its own.
     */
    logo?: string;
  };
  team: SpeakerId[];
  step: number;
}

/**
 * Who made this, and who paid for it: the sponsor on the left, held in a
 * bezel (its own words are a quote), and the four of us on the right as a
 * list on hairlines, each with the stakeholder we spent our week with.
 *
 * `eyebrow` is accepted and not drawn: the top bar already names the section.
 */
export function Credits({ title, sponsor, team }: CreditsProps) {
  const root = useRef<HTMLDivElement>(null);

  useEntrance(root, (tl) => {
    tl.from(".cr-head > *", {
      y: 36,
      opacity: 0,
      duration: 0.9,
      ease: "deck.enter",
      stagger: 0.08,
    });
    tl.from(
      ".cr-sponsor",
      { y: 60, opacity: 0, duration: 1, ease: "deck.enter" },
      0.25,
    );
    tl.from(
      ".cr-sponsor-in > *",
      { y: 24, opacity: 0, duration: 0.8, ease: "deck.enter", stagger: 0.08 },
      0.45,
    );
    tl.from(".cr-team-label", { opacity: 0, duration: 0.6 }, 0.4);
    tl.from(
      ".cr-person",
      { x: 60, opacity: 0, duration: 0.9, ease: "deck.enter", stagger: 0.09 },
      0.45,
    );
  });

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <SlideBody>
        <header className="cr-head flex flex-col">
          <h1 className="t-title text-fg text-balance">{title}</h1>
        </header>

        <div className="mt-16 grid min-h-0 flex-1 grid-cols-[780px_1fr] gap-24">
          <Bezel className="cr-sponsor h-full" coreClassName="flex flex-col">
            <div className="cr-sponsor-in flex h-full flex-col justify-center px-14 py-12">
              <span className="t-label text-muted text-[22px]">Funded by</span>
              <SponsorLockup name={sponsor.name} logo={sponsor.logo} />
              <p className="t-lede text-fg mt-10 text-[32px] leading-[1.32] text-pretty">
                {sponsor.line}
              </p>
              <figure className="mt-10 flex gap-6">
                <span className="bg-line-strong w-[2px] shrink-0 self-stretch" />
                <div className="flex flex-col">
                  <blockquote className="text-body text-[26px] leading-[1.42] text-pretty">
                    {sponsor.about}
                  </blockquote>
                  <figcaption className="t-label text-muted mt-4 text-[22px]">
                    {sponsor.name}
                  </figcaption>
                </div>
              </figure>
            </div>
          </Bezel>

          <section className="flex min-h-0 flex-col">
            <span className="cr-team-label t-label text-muted text-[22px]">
              The team
            </span>
            <ul className="mt-4 flex flex-1 flex-col justify-between">
              {team.map((p) => {
                const s = STAKEHOLDERS[TEAM[p].owns];
                return (
                  <li
                    key={p}
                    className="cr-person flex items-center gap-8 py-5 [box-shadow:inset_0_1px_0_var(--line)]"
                  >
                    <Avatar person={p} size={92} />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-display text-fg text-[40px] leading-[1.05] font-semibold tracking-[-0.025em]">
                        {TEAM[p].fullName}
                      </span>
                      <span className="text-muted mt-3 flex items-center gap-3 text-[24px]">
                        Researched
                        <span className="text-body inline-flex items-center gap-2 font-medium">
                          <Icon name={s.icon} size={26} />
                          {s.title}
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </SlideBody>
    </div>
  );
}

/**
 * The sponsor's mark beside its name. The mark is looked for at the given
 * path, then at /images/<name>-logo.svg and .png; until one loads it takes no
 * room, and if none does, the name stands alone as the wordmark.
 *
 * The mark is drawn as a mask filled with ink, so a logo exported white (for
 * a dark page) still reads on the light stage.
 */
function SponsorLockup({ name, logo }: { name: string; logo?: string }) {
  const base = `/images/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-logo`;
  const candidates = [logo, `${base}.svg`, `${base}.png`].filter(
    (c, i, all): c is string => !!c && all.indexOf(c) === i,
  );
  const [tried, setTried] = useState(0);
  const [loaded, setLoaded] = useState<{ src: string; ratio: number } | null>(
    null,
  );
  const src = candidates[tried];
  const MARK_H = 84;

  return (
    <div className="mt-8 flex h-[124px] items-center gap-7">
      {src && loaded?.src !== src && (
        // A plain <img>, only to find which file exists and its shape; the
        // mark itself is painted below. The deck is a static export.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          onLoad={(e) => {
            const img = e.currentTarget;
            const ratio = img.naturalHeight
              ? img.naturalWidth / img.naturalHeight
              : 1.5;
            setLoaded({ src, ratio });
          }}
          onError={() => setTried((t) => t + 1)}
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      )}
      {loaded && (
        <span
          aria-hidden
          className="bg-fg block shrink-0"
          style={{
            height: MARK_H,
            width: Math.round(MARK_H * loaded.ratio),
            WebkitMaskImage: `url(${loaded.src})`,
            maskImage: `url(${loaded.src})`,
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
      )}
      <span className="font-display text-fg text-[112px] leading-none font-semibold tracking-[-0.045em]">
        {name}
      </span>
    </div>
  );
}
