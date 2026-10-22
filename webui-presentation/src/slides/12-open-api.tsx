"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import {
  Browser,
  Card,
  CodeBlock,
  Grad,
  Icon,
  SlideFrame,
  useSteps,
} from "./_kit";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

const BADGE: Record<Method, { fg: string; bg: string }> = {
  GET: { fg: "#0f7a4d", bg: "#e1f3ea" },
  POST: { fg: "#1d56c4", bg: "#e3ecfb" },
  PATCH: { fg: "#9a5a05", bg: "#faefd9" },
  DELETE: { fg: "#b4232c", bg: "#fbe5e6" },
};

const ROUTES: { m: Method; path: string }[] = [
  { m: "GET", path: "/rooms/available" },
  { m: "GET", path: "/timetable/my-schedule" },
  { m: "GET", path: "/events/mine" },
  { m: "GET", path: "/attendance/mine" },
  { m: "POST", path: "/events" },
  { m: "PATCH", path: "/events/{id}" },
  { m: "DELETE", path: "/rooms/{id}" },
  { m: "GET", path: "/users/me" },
  { m: "GET", path: "/siri/next-class" },
];

const CURL = `curl "$API/rooms/available?from=…&to=…" \\
  -H "Authorization: Bearer plk_live_..."`;

const RESPONSE = `X-RateLimit-Limit: requests per window
X-RateLimit-Remaining: requests left
X-RateLimit-Reset: seconds until reset
{ "rows": [ { "code": "403" } ], "page": 1 }`;

function Reference() {
  return (
    <Browser url="plannr.paraswtf.com/api/v1" width={780} height={560}>
      <div className="h-full bg-white px-8 pt-4">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-[34px] font-semibold text-slate-900">
            Plannr API
          </p>
          <p className="t-mono text-[22px] text-slate-500">OpenAPI 3.1</p>
        </div>
        <ul className="mt-2">
          {ROUTES.map((r) => (
            <li
              key={r.m + r.path}
              className="flex items-center gap-5 border-t border-slate-200 py-[4px]"
            >
              <span
                className="t-mono inline-flex w-[104px] justify-center rounded-[10px] py-[3px] text-[20px] font-bold"
                style={{ color: BADGE[r.m].fg, background: BADGE[r.m].bg }}
              >
                {r.m}
              </span>
              <span className="t-mono text-[24px] text-slate-800">
                {r.path}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Browser>
  );
}

function Guarantee() {
  return (
    <Card accent className="p-7">
      <div className="flex items-start gap-5">
        <Icon name="shield" size={44} className="text-accent shrink-0" />
        <div>
          <p className="font-display text-fg text-[28px] leading-[1.25] font-semibold">
            Every screen&apos;s tRPC procedure has a REST route. A test fails
            the build if one does not.
          </p>
          <p className="t-mono text-body mt-3 text-[24px]">
            OpenAPI 3.1 document at /api/v1/openapi.json
          </p>
        </div>
      </div>
    </Card>
  );
}

function OpenApi({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".oa-req", { opacity: 0, y: 24 });
    gsap.set(".oa-guar", { opacity: 0, y: 24 });
    gsap.set(".oa-ref", { opacity: 1 });
    tl.to(
      ".oa-req",
      { opacity: 1, y: 0, duration: 0.7, ease: "deck.enter" },
      ">",
    );
    tl.to(".oa-ref", { opacity: 0.55, duration: 0.5, ease: "deck.enter" }, "<");
    mark();
    tl.to(
      ".oa-guar",
      { opacity: 1, y: 0, duration: 0.7, ease: "deck.enter" },
      ">",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          <Grad>Anything</Grad> can build on Plannr
        </>
      }
      subhead="One documented API, with scopes and a rate limit per key."
      tech={[
        { name: "/api/v1" },
        { name: "openapi.json" },
        { name: "Bearer key" },
        { name: "scopes" },
        { name: "X-RateLimit-*" },
      ]}
    >
      <div ref={visual} className="absolute inset-0 flex justify-between">
        <div className="oa-ref">
          <Reference />
        </div>
        <div className="flex w-[848px] flex-col gap-4">
          <div className="oa-req flex flex-col gap-4">
            <CodeBlock code={CURL} size={22} />
            <CodeBlock code={RESPONSE} size={22} mark={[1, 2, 3]} />
          </div>
          <div className="oa-guar">
            <Guarantee />
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "open-api",
  title: "Open API",
  steps: 3,
  notes: [
    "Anything can build on Plannr. This is the public API, under slash api slash v1. Rooms free for a window, my schedule, my bookings, my attendance, scheduling a class, and the Siri endpoint from the last slide.",
    "A request is one line of curl with a Bearer key. The answer is JSON, and every response carries the rate limit headers: the limit, how many are left, and the seconds until the window resets.",
    "The guarantee is that this is not a second copy of the app. Every screen's tRPC procedure has a REST route, and a test fails the build if one does not. The whole thing is described by an OpenAPI 3.1 document you can download.",
  ],
  render: ({ step }) => <OpenApi step={step} />,
};
