import type { ReleasedContent } from "~/lib/assignments";
import type { PaperMeta } from "./typeset";

/**
 * A short paper with one of everything the template prints, for the preview
 * on Settings > Documents. An administrator choosing a header wants to see it
 * above something that looks like a real paper, maths and options included.
 */
export const SAMPLE_PAPER: ReleasedContent = {
  instructions:
    "Answer every question.\n\nWrite your answers in the space provided. Calculators are not allowed.",
  sections: [
    {
      title: "Section A",
      questions: [
        {
          key: "sample-1",
          text: "Which of these is the derivative of $x^2$?",
          marks: 1,
          kind: "choice",
          options: ["$x$", "$2x$", "$x^3 / 3$", "$2$"],
        },
        {
          key: "sample-2",
          text: "Explain what this function returns for an empty list.",
          marks: 3,
          kind: "text",
          code: "def total(items):\n    return sum(items)",
        },
      ],
    },
    {
      title: "Section B",
      questions: [
        {
          key: "sample-3",
          text: "Show that $sum_(i=1)^n i = (n(n+1))/2$ for every positive whole number $n$.",
          marks: 6,
          kind: "text",
        },
      ],
    },
  ],
};

export const SAMPLE_META: PaperMeta = {
  title: "Sample paper",
  kind: "Class test",
  course: "Course name",
  group: "Group name",
  when: "Mon 2 Nov 2026, 10am",
  durationMinutes: 60,
  totalMarks: 10,
};
