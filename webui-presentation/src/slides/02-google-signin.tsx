"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Card, Grad, Icon, SlideFrame, useSteps } from "./_kit";

const DOMAIN = "sicsr.ac.in";

const CHECKS = [
  {
    code: "email_verified === true",
    say: "Google confirms the address",
  },
  {
    code: `profile.hd === "${DOMAIN}"`,
    say: "The Workspace domain is the college's",
  },
  {
    code: `email.endsWith("@${DOMAIN}")`,
    say: "The address itself carries the suffix",
  },
] as const;

const ACCOUNTS = [
  { initials: "YO", name: "Your name", mail: `you@${DOMAIN}`, ok: true },
  { initials: "PE", name: "Personal", mail: "name@gmail.com", ok: false },
];

function Chooser() {
  return (
    <div className="bg-raised w-[560px] rounded-[22px] p-9 shadow-[inset_0_0_0_1px_var(--line),var(--shadow-2)]">
      <p className="font-display text-fg text-[34px] font-semibold">
        Choose an account
      </p>
      <p className="text-muted mt-2 text-[22px]">to continue to Plannr</p>
      <ul className="mt-6">
        {ACCOUNTS.map((a) => (
          <li
            key={a.mail}
            className="flex items-center gap-5 border-t py-5"
            style={{ borderColor: "var(--line)" }}
          >
            <span
              className={`font-display flex h-[60px] w-[60px] items-center justify-center text-[22px] font-semibold ${a.ok ? "bg-accent text-white" : "bg-sunken text-muted"}`}
              style={{ borderRadius: "30%" }}
            >
              {a.initials}
            </span>
            <span className="flex flex-col">
              <span
                className={`text-[26px] font-medium ${a.ok ? "text-fg" : "text-muted"}`}
              >
                {a.name}
              </span>
              <span className="t-mono text-muted text-[21px]">{a.mail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Shield({ step }: { step: number }) {
  return (
    <Card accent className="w-[760px] p-9">
      <div className="flex items-center gap-4">
        <Icon name="shield" size={44} className="text-accent" />
        <p className="font-display text-fg text-[34px] font-semibold">
          The signIn callback, on the server
        </p>
      </div>
      <ul className="mt-6">
        {CHECKS.map((c, i) => (
          <li
            key={c.code}
            className="ck flex items-center gap-5 border-t py-5"
            style={{ borderColor: "var(--accent-line)" }}
            data-on={step > i}
          >
            <Icon
              name="checkCircle"
              size={40}
              className="text-accent shrink-0"
            />
            <span className="flex flex-col">
              <span className="t-mono text-fg text-[26px] font-medium">
                {c.code}
              </span>
              <span className="text-muted text-[21px]">{c.say}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export const slide: SlideDef = {
  id: "google-signin",
  title: "Sign in with Google",
  steps: 4,
  notes: [
    "People sign in with the Google account they already use at college. No new password.",
    "The server checks the first thing: Google says the email is verified.",
    "Second: the hd claim, the Workspace domain, must be the college's. The domain hint on the chooser is only a hint, so we never trust it.",
    "Third: the address ends with the college suffix. Pass all three and a session row is created in Postgres.",
  ],
  render: ({ step }) => <GoogleSignin step={step} />,
};

function GoogleSignin({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    // Resting state first (a set at time 0 is skipped by the seek to s0).
    gsap.set(".ck", { opacity: 0.25 });
    CHECKS.forEach((_, i) => {
      tl.to(
        `.ck:nth-child(${i + 1})`,
        { opacity: 1, duration: 0.5, ease: "deck.enter" },
        ">",
      );
      mark();
    });
  });

  return (
    <SlideFrame
      title={
        <>
          Sign in with the account <Grad>you already have</Grad>
        </>
      }
      subhead="Only college Google accounts get in, and the server checks every one."
      tech={[
        { name: "GoogleProvider" },
        { name: "signIn callback" },
        { name: "hd claim" },
        { name: "database sessions" },
        { name: "PrismaAdapter" },
        { name: "permission bitfield" },
      ]}
    >
      <div
        ref={visual}
        className="absolute inset-0 flex items-center justify-between"
      >
        <Chooser />
        <div className="flex flex-col items-center gap-2">
          <Icon name="arrowRight" size={64} className="text-accent" />
        </div>
        <Shield step={step} />
      </div>
    </SlideFrame>
  );
}
