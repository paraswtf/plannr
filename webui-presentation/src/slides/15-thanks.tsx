import type { SlideDef } from "~/deck/types";
import { Thanks } from "~/templates/Thanks";

const MEMBERS = ["Paras Deshpande", "Sonal Mohrir", "Tanisha Nath"];

export const slide: SlideDef = {
  id: "thanks",
  title: "Thank you",
  chrome: false,
  notes:
    "That is Plannr: one timetable, built for the phone in your hand. Thank you. We are happy to take questions, and everything shown today is live at plannr dot paraswtf dot com.",
  render: ({ step, active }) => (
    <>
      <Thanks
        title="Plannr"
        subtitle="One timetable, built for the phone in your hand."
        footer="plannr.paraswtf.com"
        step={step}
        active={active}
      />
      <div className="absolute inset-x-0 top-[784px] flex flex-col items-center text-center">
        <p className="font-display text-fg flex gap-x-12 text-[34px] font-semibold">
          {MEMBERS.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </p>
        <p className="text-body mt-4 text-[26px]">
          Web UI and Content Management, BCA Sem VII Div A, Assessment 3
        </p>
        <p className="text-muted mt-1 text-[26px]">
          Faculty: Shashank T. Gaikwad · Symbiosis Institute of Computer Studies
          and Research
        </p>
      </div>
    </>
  ),
};
