"use client";

import { useRef } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import { PhoneFrame, StatusBar } from "~/ui/frames";
import { Icon } from "~/ui/icon";
import { courseTone, MockTabBar } from "~/ui/mock";

import {
  BlockTag,
  CalendarGlyph,
  DayBlock,
  type DayFrame,
  Finger,
  GUTTER,
  hourLabel,
  HourGrid,
  rangeLabel,
  Notice,
  PHONE_HEIGHT,
  SCREEN_H,
  Toast,
  yOf,
} from "./_phone-kit";

export interface PhoneChangeAlertProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
}

/** Today, 9am to 5pm, under the app's header. */
const DAY: DayFrame = { top: 140, startHour: 9, endHour: 17, rowH: 66 };
/** Design Thinking was at 12:30 in 301; the coordinator moved it to 10am in 304. */
const OLD = { start: 12.5, room: "301" };
const NEW = { start: 10, room: "304" };
const LIFT = yOf(DAY, OLD.start) - yOf(DAY, NEW.start);
const DT = courseTone("Design Thinking");
/** Where the notification sits on the lock screen, and where it is tapped. */
const NOTIF_TOP = 292;
const TAP = { x: 196, y: NOTIF_TOP + 56 };
const TIME = "8:12";

/**
 * A change finds the student, instead of the student finding the change.
 *
 * Builds (steps = 3):
 *   0: lock screen, a Plannr notification: "Class moved. Design Thinking is now at 10am in Room 304".
 *   1: open it: on the schedule, the class block moves from its old slot to the new one.
 *   2: the synced Google Calendar follows ("Updated in Google Calendar"), then an
 *      extra class appears, marked new, and is added to the calendar too. Its
 *      banner is sent only to the division it is for.
 *
 * The notification drops in by itself once the slide is on screen (at once in
 * the presenter's preview). The lock screen is a layer over the app: opening
 * the notification slides it away and the app rises underneath.
 */
export function PhoneChangeAlert({
  step,
  active,
  flipId,
}: PhoneChangeAlertProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();
  const dropped = useRef(false);
  const drop = useRef<gsap.core.Tween | null>(null);

  // The notification arriving: once, when the slide first shows.
  useGSAP(
    () => {
      // Tapped before it has landed: land it first.
      if (step > 0 && drop.current) {
        drop.current.progress(1);
        drop.current = null;
      }
      if (dropped.current) return;
      if (instant || step > 0) {
        dropped.current = true;
        gsap.set(".ca-drop", { y: 0, opacity: 1 });
        return;
      }
      if (!active) return;
      dropped.current = true;
      drop.current = gsap.fromTo(
        ".ca-drop",
        { y: -90, opacity: 0, scale: 0.94 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.8,
          ease: "back.out(1.3)",
          delay: 0.8,
          onComplete: () => {
            drop.current = null;
          },
        },
      );
    },
    { scope: ref, dependencies: [active, instant, step] },
  );

  useSteps(ref, step, (tl, mark) => {
    gsap.set(".ca-finger", { x: TAP.x, y: TAP.y, scale: 1.3 });
    gsap.set(".ca-app", { scale: 0.93, transformOrigin: "50% 40%" });
    gsap.set(".ca-dt", { y: LIFT });
    gsap.set(".ca-dt-new", { opacity: 0 });
    gsap.set(".ca-ghost", { opacity: 0 });
    gsap.set(".ca-moved", { scale: 0, opacity: 0 });
    gsap.set(".ca-toast", { y: 80, opacity: 0 });
    gsap.set(".ca-t2", { y: 24, opacity: 0 });
    gsap.set(".ca-extra", {
      scale: 0.6,
      opacity: 0,
      transformOrigin: "50% 50%",
    });
    gsap.set(".ca-banner", { y: -170 });
    // The frame's home indicator: white on the lock screen, dark once the
    // light app is up. PhoneFrame draws it as the screen's last child.
    const indicator = ref.current?.querySelector(".phone-home-indicator");

    // 1 — tap the notification; the lock screen slides away, the app rises,
    // and Design Thinking lifts out of 12:30 and travels up to 10am.
    tl.to(".ca-finger", {
      opacity: 1,
      scale: 1,
      duration: 0.22,
      ease: "power2.out",
    });
    tl.to([".ca-finger", ".ca-notif"], {
      scale: 0.94,
      duration: 0.12,
      ease: "power1.out",
    });
    tl.addLabel("open");
    tl.to(
      ".ca-finger",
      { opacity: 0, scale: 1.2, duration: 0.25, ease: "power1.out" },
      "open",
    );
    tl.to(
      ".ca-lock",
      { y: -SCREEN_H, duration: 0.7, ease: "power3.inOut" },
      "open",
    );
    tl.to(
      ".ca-app",
      { scale: 1, duration: 0.8, ease: "power3.out" },
      "open+=0.25",
    );
    if (indicator) {
      tl.to(
        indicator,
        { backgroundColor: "rgba(13,17,23,0.85)", duration: 0.3 },
        "open+=0.4",
      );
    }
    tl.addLabel("move", "open+=0.95");
    tl.to(
      ".ca-dt",
      {
        scale: 1.04,
        boxShadow: `inset 0 0 0 1px ${DT.ring}, 0 18px 34px -8px rgba(16,24,40,0.3)`,
        duration: 0.25,
        ease: "power2.out",
      },
      "move",
    );
    tl.to(".ca-ghost", { opacity: 1, duration: 0.3 }, "move+=0.15");
    tl.to(
      ".ca-dt",
      { y: 0, duration: 0.95, ease: "power3.inOut" },
      "move+=0.2",
    );
    tl.to(".ca-dt-old", { opacity: 0, duration: 0.2 }, "move+=0.6");
    tl.to(".ca-dt-new", { opacity: 1, duration: 0.2 }, "move+=0.6");
    tl.to(
      ".ca-dt",
      {
        scale: 1,
        boxShadow: `inset 0 0 0 1px ${DT.ring}, 0 0 0 0 rgba(16,24,40,0)`,
        duration: 0.3,
        ease: "power2.inOut",
      },
      "move+=1.1",
    );
    tl.to(
      ".ca-moved",
      { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2)" },
      "move+=1.2",
    );
    mark();

    // 2 — the synced calendar follows the move; then an extra lecture, only
    // for this division: the banner drops, the class appears at 4pm, and the
    // calendar has it too.
    tl.to(".ca-toast", { y: 0, opacity: 1, duration: 0.6, ease: "deck.enter" });
    tl.to(".ca-banner", { y: 0, duration: 0.7, ease: "power3.out" }, "+=0.5");
    tl.addLabel("extra", "-=0.2");
    tl.to(
      ".ca-extra",
      { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.5)" },
      "extra",
    );
    tl.to(
      ".ca-t1",
      { y: -24, opacity: 0, duration: 0.35, ease: "power2.in" },
      "extra+=0.35",
    );
    tl.to(
      ".ca-t2",
      { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" },
      "extra+=0.55",
    );
    mark();
  });

  return (
    <div
      ref={ref}
      className="relative flex h-full w-full items-center justify-center"
    >
      <PhoneFrame
        height={PHONE_HEIGHT}
        flipId={flipId}
        statusBar={false}
        screen="dark"
      >
        {/* Its own stacking context, so the dynamic island stays on top. */}
        <div className="absolute inset-0 isolate">
          {/* The app, waiting under the lock screen. */}
          <div
            className="ca-app absolute inset-0"
            style={{ background: "var(--paper)" }}
          >
            <StatusBar time={TIME} />
            <div
              className="absolute inset-x-0 flex items-end justify-between px-5"
              style={{ top: 62 }}
            >
              <div>
                <div className="text-[13.5px] font-medium text-[rgba(44,49,53,0.58)]">
                  Tue 11 Aug
                </div>
                <div className="font-display text-[30px] leading-tight font-bold tracking-[-0.02em] text-[#0d1117]">
                  Today
                </div>
              </div>
              <span
                className="mb-1 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-mono text-[12.5px] font-semibold"
                style={{
                  color: "var(--slate)",
                  boxShadow: "inset 0 0 0 1px rgba(68,88,121,0.28)",
                }}
              >
                <Icon name="users" size={14} stroke={2} />
                BCA-A
              </span>
            </div>

            <HourGrid frame={DAY} />
            <DayBlock
              frame={DAY}
              start={9}
              end={10}
              title="Statistics"
              room="301"
              detail="Dr. Mehta"
            />
            <DayBlock
              frame={DAY}
              start={11.25}
              end={12.25}
              title="Web Technologies"
              room="Lab 2"
              detail="Dr. Fernandes"
            />
            <DayBlock
              frame={DAY}
              start={13.5}
              end={14.5}
              title="Data Mining"
              room="301"
              detail="Prof. Iyer"
            />
            <DayBlock
              frame={DAY}
              start={15}
              end={16}
              title="Business Analytics"
              room="304"
              detail="Dr. Mehta"
            />

            {/* Where it was. */}
            <div
              className="ca-ghost absolute flex items-center rounded-[12px] px-3 font-mono text-[11.5px] text-[rgba(44,49,53,0.55)]"
              style={{
                top: yOf(DAY, OLD.start) + 2,
                height: DAY.rowH - 4,
                left: GUTTER,
                right: 10,
                border: "1.5px dashed rgba(68,88,121,0.45)",
              }}
            >
              Was here at {hourLabel(OLD.start)} · {OLD.room}
            </div>

            {/* Design Thinking, drawn at its new place and started at its old one. */}
            <div
              className="ca-dt absolute z-10 rounded-[12px] px-3 text-[#0d1117]"
              style={{
                paddingTop: 7,
                top: yOf(DAY, NEW.start) + 2,
                height: DAY.rowH - 4,
                left: GUTTER,
                right: 10,
                background: DT.fill,
                boxShadow: `inset 0 0 0 1px ${DT.ring}`,
              }}
            >
              <span className="block truncate text-[14.5px] leading-[17px] font-semibold">
                Design Thinking
              </span>
              <span className="relative mt-[3px] block h-[14px] font-mono text-[11.5px] leading-[14px] text-[rgba(44,49,53,0.72)]">
                <span className="ca-dt-old absolute inset-0 truncate">
                  {rangeLabel(OLD.start, OLD.start + 1)} · {OLD.room}
                </span>
                <span className="ca-dt-new absolute inset-0 truncate">
                  {rangeLabel(NEW.start, NEW.start + 1)} ·{" "}
                  <b className="font-bold text-[#0d1117]">{NEW.room}</b>
                </span>
              </span>
              <span className="mt-[3px] block truncate text-[11.5px] leading-[14px] text-[rgba(44,49,53,0.6)]">
                Prof. Kulkarni
              </span>
              <BlockTag className="ca-moved">Moved</BlockTag>
            </div>

            {/* The extra lecture, at 4pm. */}
            <DayBlock
              className="ca-extra z-10"
              frame={DAY}
              start={16}
              end={17}
              title="Extra lecture"
              course="Data Mining"
              room="Lab 2"
              detail="Data Mining · Prof. Iyer"
              style={{
                boxShadow: `inset 0 0 0 1px ${courseTone("Data Mining").ring}, 0 0 0 2.5px var(--green)`,
              }}
            >
              <BlockTag bg="var(--green)">New</BlockTag>
            </DayBlock>

            {/* Already in their own calendar. */}
            <Toast className="ca-toast z-20" style={{ top: 690 }}>
              <CalendarGlyph size={22} />
              <span className="grid overflow-hidden">
                <span className="ca-t1 [grid-area:1/1]">
                  Updated in Google Calendar
                </span>
                <span className="ca-t2 [grid-area:1/1]">
                  Added to Google Calendar
                </span>
              </span>
              <Icon name="check" size={16} stroke={2.6} color="var(--good)" />
            </Toast>

            <MockTabBar active={0} />

            {/* Only for the division it is for. */}
            <div
              className="ca-banner absolute inset-x-2.5 z-30"
              style={{ top: 50 }}
            >
              <Notice
                title="Extra lecture"
                body={
                  <>
                    Data Mining, 4pm today in Lab 2. Sent to{" "}
                    <b className="whitespace-nowrap">BCA-A</b> only.
                  </>
                }
                style={{
                  background: "rgba(255,255,255,0.97)",
                  boxShadow:
                    "0 18px 40px -12px rgba(16,24,40,0.3), inset 0 0 0 1px rgba(68,88,121,0.14)",
                }}
              />
            </div>
          </div>

          {/* The lock screen, over the app. */}
          <div
            className="ca-lock absolute inset-0 z-40 overflow-hidden text-white"
            style={{
              background: [
                // The phone's wallpaper, in the brand's colours: bright enough
                // to sit on a light stage, deep enough for white type.
                "radial-gradient(120% 60% at 0% 0%, rgba(122,46,143,0.95), transparent 62%)",
                "radial-gradient(100% 55% at 100% 38%, rgba(201,48,108,0.8), transparent 66%)",
                "radial-gradient(130% 55% at 50% 112%, rgba(246,167,59,0.9), transparent 62%)",
                "radial-gradient(90% 50% at 0% 82%, rgba(232,69,94,0.75), transparent 66%)",
                "linear-gradient(180deg, #4b1f66 0%, #82295f 52%, #b8404c 100%)",
              ].join(", "),
            }}
          >
            <StatusBar time={TIME} ink="#ffffff" />
            <svg
              className="absolute left-1/2 -ml-[8px]"
              style={{ top: 62 }}
              width="16"
              height="20"
              viewBox="0 0 16 20"
              aria-hidden
            >
              <path
                d="M3 8V6a5 5 0 0 1 10 0v2"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
              />
              <rect
                x="0.5"
                y="8"
                width="15"
                height="11.5"
                rx="2.5"
                fill="#fff"
              />
            </svg>
            <div className="absolute inset-x-0 text-center" style={{ top: 96 }}>
              <div className="text-[20px] font-semibold tracking-[-0.01em] opacity-90">
                Tuesday 11 August
              </div>
              <div className="font-display text-[104px] leading-[1.02] font-bold tracking-[-0.03em]">
                {TIME}
              </div>
            </div>

            <div
              className="ca-drop absolute inset-x-3"
              style={{ top: NOTIF_TOP, opacity: 0 }}
            >
              <Notice
                className="ca-notif"
                size="lg"
                title="Class moved"
                time="now"
                body={
                  <>
                    Design Thinking is now at <b>10am</b> in <b>Room 304</b>,
                    not 12:30.
                  </>
                }
              />
            </div>

            <span
              className="absolute flex h-[50px] w-[50px] items-center justify-center rounded-full"
              style={{
                left: 46,
                bottom: 50,
                background: "rgba(13,17,23,0.26)",
              }}
            >
              <Icon name="zap" size={22} stroke={2} />
            </span>
            <span
              className="absolute flex h-[50px] w-[50px] items-center justify-center rounded-full"
              style={{
                right: 46,
                bottom: 50,
                background: "rgba(13,17,23,0.26)",
              }}
            >
              <Icon name="camera" size={24} color="#ffffff" weight="regular" />
            </span>
          </div>

          <Finger className="ca-finger" />
        </div>
      </PhoneFrame>
    </div>
  );
}
