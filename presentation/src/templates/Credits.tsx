"use client";

import { useRef, useState, type ReactNode } from "react";

import { STAKEHOLDERS, TEAM } from "~/content/team";
import type { SpeakerId } from "~/deck/types";
import { Icon } from "~/ui/icon";
import { Eyebrow, Glow, SlideBody } from "~/ui/layout";
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
 * Who made this, and who paid for it: the sponsor on the left, in its own
 * card, and the four of us on the right, each with the stakeholder we spent
 * our week with.
 */
export function Credits({ eyebrow, title, sponsor, team }: CreditsProps) {
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
      <Glow x="26%" y="66%" size={1300} />
      <SlideBody>
        <header className="cr-head flex flex-col">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="t-title mt-6 text-balance">{title}</h1>
        </header>

        <div className="mt-14 grid min-h-0 flex-1 grid-cols-[760px_1fr] gap-20">
          <section className="cr-sponsor bg-card ring-hair relative flex flex-col overflow-hidden rounded-[28px] px-14 py-12">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[240px]"
              style={{
                background:
                  "linear-gradient(180deg, rgba(232, 69, 94, 0.1), transparent)",
              }}
            />
            <div className="cr-sponsor-in relative flex h-full flex-col justify-center">
              <span className="t-eyebrow text-muted">Funded by</span>
              <SponsorLockup name={sponsor.name} logo={sponsor.logo} />
              <p className="mt-10 text-[32px] leading-[1.32] tracking-[-0.005em] text-pretty">
                {sponsor.line}
              </p>
              <p className="text-muted mt-8 flex gap-4 text-[26px] leading-[1.42] text-pretty">
                <span className="bg-line-strong mt-1 w-[3px] shrink-0 self-stretch rounded-full" />
                <span>
                  {sponsor.about}
                  <span className="text-faint t-mono mt-3 block text-[22px]">
                    — {sponsor.name}
                  </span>
                </span>
              </p>
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <span className="cr-team-label t-eyebrow text-muted">The team</span>
            <ul className="mt-6 flex flex-1 flex-col justify-between">
              {team.map((p, i) => {
                const s = STAKEHOLDERS[TEAM[p].owns];
                return (
                  <li
                    key={p}
                    className={`cr-person flex items-center gap-7 py-4 ${i > 0 ? "[box-shadow:inset_0_1px_0_var(--line)]" : ""}`}
                  >
                    <Avatar person={p} size={88} />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-display text-[38px] leading-[1.05] font-bold tracking-[-0.025em]">
                        {TEAM[p].fullName}
                      </span>
                      <span className="text-muted mt-2 flex items-center gap-3 text-[24px]">
                        Researched
                        <span
                          className="inline-flex items-center gap-2 font-semibold"
                          style={{ color: s.color }}
                        >
                          <Icon name={s.icon} size={24} stroke={2} />
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
 */
function SponsorLockup({ name, logo }: { name: string; logo?: string }) {
  const base = `/images/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-logo`;
  const candidates = [logo, `${base}.svg`, `${base}.png`].filter(
    (c, i, all): c is string => !!c && all.indexOf(c) === i,
  );
  const [tried, setTried] = useState(0);
  const [loaded, setLoaded] = useState<string | null>(null);
  const src = candidates[tried];

  return (
    <div className="mt-10 flex h-[124px] items-center gap-7">
      {src && (
        // A plain <img>: the deck is a static export with images served as-is.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          onLoad={() => setLoaded(src)}
          onError={() => setTried((t) => t + 1)}
          className="block h-[100px] w-auto"
          style={
            loaded === src ? undefined : { position: "absolute", opacity: 0 }
          }
        />
      )}
      <span className="font-display text-[112px] leading-none font-bold tracking-[-0.045em]">
        {name}
      </span>
    </div>
  );
}
