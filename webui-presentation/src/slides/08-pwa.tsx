"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";
import { StatusBar } from "~/ui/frames";
import { MockAppBar, MockClass, MockTabBar } from "~/ui/mock";

import { Card, Chip, Grad, Icon, Phone, SlideFrame, useSteps } from "./_kit";

const PHONE_H = 470;

function PhoneScreen() {
  return (
    <div className="absolute inset-0" style={{ background: "#eef0f3" }}>
      <MockAppBar title="Today" subtitle="Wed 4 Nov" initials="PA" />
      <div className="flex flex-col gap-3 px-5 pt-2">
        <MockClass title="Design Thinking" time="09:00 - 10:00" room="402" />
        <MockClass title="Web Technologies" time="11:00 - 12:00" room="403" />
        <MockClass title="Design Thinking" time="14:30 - 15:30" room="402" />
      </div>
      <div className="absolute inset-x-0 bottom-0">
        <MockTabBar active={0} />
      </div>
      <StatusBar />
      {/* Offline status bar, drawn over the online one. */}
      <div
        className="ph-off absolute inset-x-0 top-0 flex items-center justify-between"
        style={{ height: 54, padding: "0 34px 0 46px", background: "#eef0f3" }}
      >
        <span className="text-[17px] font-semibold">9:41</span>
        <Icon name="wifiOff" size={22} />
      </div>
    </div>
  );
}

function Node({
  icon,
  name,
  note,
  cls,
  accent,
}: {
  icon: "phone" | "zap" | "globe";
  name: string;
  note: string;
  cls: string;
  accent?: boolean;
}) {
  return (
    <Card
      accent={accent}
      className={`${cls} flex items-center gap-4 px-6 py-4`}
    >
      <Icon
        name={icon}
        size={44}
        className={accent ? "text-accent" : "text-fg"}
      />
      <span className="flex flex-col">
        <span className="font-display text-fg text-[28px] leading-tight font-semibold">
          {name}
        </span>
        <span className="text-muted text-[22px] leading-tight">{note}</span>
      </span>
    </Card>
  );
}

function Link({ cls }: { cls: string }) {
  return (
    <div
      className={`${cls} relative h-[4px] flex-1 rounded-full`}
      style={{ background: "var(--line-strong)" }}
    >
      <span
        className={`${cls}-fill bg-accent absolute inset-0 origin-left rounded-full`}
      />
    </div>
  );
}

const CACHES = [
  {
    id: "static",
    name: "plannr-static-v1",
    how: "cache-first",
    what: "Scripts, styles, icons",
  },
  {
    id: "pages",
    name: "plannr-pages-v1",
    how: "network-first",
    what: "Pages, your last schedule",
  },
  {
    id: "data",
    name: "plannr-data-v1",
    how: "network-first",
    what: "tRPC queries",
  },
];

export const slide: SlideDef = {
  id: "pwa",
  title: "Works offline",
  steps: 3,
  notes: [
    "Plannr is an installable web app with a service worker standing between the app and the network. With a signal, everything is live: the worker asks the network first.",
    "Now airplane mode. The worker waits up to four seconds for the network, and when nothing answers it serves the saved copy. The timetable opens on your last schedule, with a small notice that says what you are looking at.",
    "And it is careful. When someone signs in or out, the pages and data caches are wiped, so a shared lab computer never shows the last person's day. It also installs to the home screen with a manifest, standalone display and shortcuts.",
  ],
  render: ({ step }) => <Pwa step={step} />,
};

function Pwa({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".ph-off", { opacity: 0 });
    gsap.set(".toast", { opacity: 0, y: 24 });
    gsap.set(".net-x", { opacity: 0 });
    gsap.set(".l-net-fill", { scaleX: 1 });
    gsap.set(".cache-live", { opacity: 0.5 });
    gsap.set(".wipe, .rule-b", { opacity: 0 });

    // 2: offline, served from the saved copy.
    tl.to(".ph-off", { opacity: 1, duration: 0.4 });
    tl.to(".l-net-fill", { scaleX: 0, duration: 0.5, ease: "deck.enter" }, "<");
    tl.to(".net-x", { opacity: 1, duration: 0.4 }, "<");
    tl.to(".node-net", { opacity: 0.45, duration: 0.4 }, "<");
    tl.to(".cache-pages, .cache-data", { opacity: 1, duration: 0.4 }, "<0.3");
    tl.to(
      ".toast",
      { opacity: 1, y: 0, duration: 0.6, ease: "deck.enter" },
      "<",
    );
    mark();

    // 3: sign-out wipes the private caches.
    tl.to(".toast", { opacity: 0, y: 12, duration: 0.4 });
    tl.to(".rule-a", { opacity: 0, duration: 0.3 }, "<");
    tl.to(".rule-b", { opacity: 1, duration: 0.4 }, "<0.2");
    tl.to(".cache-pages, .cache-data", { opacity: 0.5, duration: 0.5 }, "<");
    tl.to(".wipe", { opacity: 1, duration: 0.5, ease: "deck.enter" }, "<0.1");
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          Open your timetable <Grad>with no signal</Grad>
        </>
      }
      subhead="A service worker keeps the last thing you saw."
      tech={[
        { name: "navigator.serviceWorker.register" },
        { name: "Cache Storage" },
        { name: "fetch event" },
        { name: "offline.html" },
        { name: "manifest.webmanifest" },
      ]}
    >
      <div ref={visual} className="absolute inset-x-0 top-6 bottom-0">
        <div className="absolute top-0 left-0">
          <Phone height={PHONE_H} statusBar={false}>
            <PhoneScreen />
          </Phone>
        </div>
        <div
          className="toast bg-fg absolute flex items-center gap-3 rounded-[16px] px-5 py-4 text-white"
          style={{
            left: 110,
            top: 300,
            width: 330,
            boxShadow: "var(--shadow-3)",
          }}
        >
          <Icon name="wifiOff" size={34} />
          <span className="text-[22px] leading-tight">
            You&apos;re offline. Showing what was saved on this device.
          </span>
        </div>

        <div className="absolute top-0 left-[500px] w-[1164px]">
          <div className="flex items-center gap-4">
            <Node icon="phone" name="Plannr" note="the app" cls="node-app" />
            <Link cls="l-app" />
            <Node
              icon="zap"
              name="Service worker"
              note="/sw.js"
              cls="node-sw"
              accent
            />
            <Link cls="l-net" />
            <div className="relative">
              <Node
                icon="globe"
                name="Network"
                note="the server"
                cls="node-net"
              />
              <span className="net-x text-accent absolute -top-3 -right-3 rounded-full bg-white">
                <Icon name="x" size={36} />
              </span>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {CACHES.map((c) => (
              <Card
                key={c.id}
                className={`cache-live cache-${c.id} relative p-5`}
              >
                <p className="t-mono text-fg text-[22px] font-medium">
                  {c.name}
                </p>
                <p className="text-accent text-[22px] font-semibold">{c.how}</p>
                <p className="text-muted text-[22px] leading-tight">{c.what}</p>
                {c.id !== "static" && (
                  <div className="wipe text-accent absolute top-4 right-4 flex items-center gap-2 text-[22px] font-semibold">
                    <Icon name="trash" size={30} />
                    wiped
                  </div>
                )}
              </Card>
            ))}
          </div>
          <div
            className="mt-5 grid border-t pt-4"
            style={{ borderColor: "var(--line-strong)" }}
          >
            <div className="rule-a col-start-1 row-start-1 flex items-center gap-4">
              <Icon name="hourglass" size={40} className="text-accent" />
              <p className="font-display text-fg text-[34px] font-semibold">
                Network first, 4 s patience, then the saved copy
              </p>
            </div>
            <div className="rule-b col-start-1 row-start-1 flex items-center gap-4">
              <Icon name="logout" size={40} className="text-accent" />
              <p className="font-display text-fg text-[34px] font-semibold">
                Sign in or out, and the private caches are wiped
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Chip icon="download" size={22}>
              Installable
            </Chip>
            <Chip size={22}>display: standalone</Chip>
            <Chip size={22}>shortcuts: My schedule, Timetable</Chip>
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}
