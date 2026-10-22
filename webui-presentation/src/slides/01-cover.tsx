import type { SlideDef } from "~/deck/types";
import { Cover } from "~/templates/Cover";

export const slide: SlideDef = {
  id: "cover",
  title: "Plannr",
  chrome: false,
  notes:
    "Plannr, the college timetable. Thirteen features, and for each one the web method that makes it work.",
  render: ({ active }) => (
    <Cover
      title="Plannr"
      subtitle="Everything under the hood, one slide at a time"
      chips={["Next.js 15", "React 19", "tRPC", "PostgreSQL", "PWA"]}
      team={["paras"]}
      footer="Web UI and Content Management · Assessment 3 · SICSR"
      step={0}
      active={active}
    />
  ),
};
