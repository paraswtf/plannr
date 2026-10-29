"use client";

import { Textarea } from "~/components/ui/field";
import {
  type Answers,
  type ReleasedContent,
  type ReleasedQuestion,
  type SheetEntry,
} from "~/lib/assignments";

/** "(a)", "(b)": how a paper names its options. */
export const optionLetter = (index: number) =>
  `(${String.fromCharCode(97 + index)})`;

/** The questions of a written paper by key, or an empty map for an uploaded one. */
export function questionsByKey(
  content: ReleasedContent | null | undefined,
): Map<string, ReleasedQuestion> {
  const map = new Map<string, ReleasedQuestion>();
  for (const section of content?.sections ?? []) {
    for (const q of section.questions) map.set(q.key, q);
  }
  return map;
}

/** "1 mark", "2.5 marks". */
export const marksLabel = (n: number) => `${n} ${n === 1 ? "mark" : "marks"}`;

/**
 * A question as written: its text exactly as typed (maths left in its `$...$`
 * form), and its code, if it has any, in a monospaced box.
 */
export function QuestionText({ question }: { question: ReleasedQuestion }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-ink text-base break-words whitespace-pre-wrap">
        {question.text}
      </p>
      {question.code && (
        <pre className="bg-tint text-ink overflow-x-auto rounded-[10px] px-3 py-2 font-mono text-xs leading-relaxed">
          <code>{question.code}</code>
        </pre>
      )}
    </div>
  );
}

/** The options of a choice question, read only, for the paper. */
export function OptionList({ options }: { options: string[] }) {
  return (
    <ol className="flex flex-col gap-1">
      {options.map((option, i) => (
        <li key={i} className="text-ink flex gap-2 text-sm">
          <span className="text-muted shrink-0 font-mono">
            {optionLetter(i)}
          </span>
          <span className="min-w-0 break-words">{option}</span>
        </li>
      ))}
    </ol>
  );
}

/** One answer, read only: the words written or the option chosen. */
export function AnswerValue({
  entry,
  answer,
  question,
}: {
  entry: SheetEntry;
  answer: Answers[string] | undefined;
  question?: ReleasedQuestion;
}) {
  if (entry.kind === "choice") {
    if (answer?.choice === undefined) {
      return <p className="text-faint text-sm">No option chosen.</p>;
    }
    const text = question?.options?.[answer.choice];
    return (
      <p className="text-ink text-sm">
        <span className="font-mono">{optionLetter(answer.choice)}</span>
        {text ? ` ${text}` : ""}
      </p>
    );
  }
  const text = answer?.text?.trim();
  if (!text) return <p className="text-faint text-sm">No answer written.</p>;
  return (
    <p className="text-ink text-sm break-words whitespace-pre-wrap">
      {answer?.text}
    </p>
  );
}

/**
 * The answer sheet: one entry per line of the sheet. Editable while the test
 * is open, read only after it, with marks beside each line once they are out.
 */
export function AnswerSheet({
  sheet,
  questions,
  answers,
  onChange,
  readOnly = false,
  marks,
}: {
  sheet: SheetEntry[];
  /** A written paper's questions, for the options' words. Empty for an upload. */
  questions: Map<string, ReleasedQuestion>;
  answers: Answers;
  onChange?: (key: string, answer: Answers[string]) => void;
  readOnly?: boolean;
  /** Published marks, keyed by question. */
  marks?: Record<string, number> | null;
}) {
  return (
    <ol className="flex flex-col">
      {sheet.map((entry) => {
        const question = questions.get(entry.key);
        const answer = answers[entry.key];
        const given = marks?.[entry.key];
        const headId = `sheet-${entry.key}`;
        return (
          <li
            key={entry.key}
            className="flex flex-col gap-2 py-4 shadow-[0_1px_0_var(--hair-soft)] first:pt-0 last:pb-0 last:shadow-none"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span id={headId} className="text-title text-sm font-semibold">
                Question {entry.label}
              </span>
              <span className="text-faint font-mono text-xs tabular-nums">
                {marks
                  ? `${given ?? 0} of ${entry.marks}`
                  : marksLabel(entry.marks)}
              </span>
            </div>
            {readOnly ? (
              <AnswerValue entry={entry} answer={answer} question={question} />
            ) : entry.kind === "choice" ? (
              <div
                role="radiogroup"
                aria-labelledby={headId}
                className="flex flex-col gap-1"
              >
                {Array.from({ length: entry.optionCount ?? 2 }, (_, i) => (
                  <label
                    key={i}
                    className="hover:bg-tint-hover flex min-h-10 cursor-pointer items-center gap-3 rounded-[10px] px-2 text-sm lg:min-h-9"
                  >
                    <input
                      type="radio"
                      name={`answer-${entry.key}`}
                      checked={answer?.choice === i}
                      onChange={() => onChange?.(entry.key, { choice: i })}
                      className="accent-slate h-4 w-4 shrink-0"
                    />
                    <span className="text-muted font-mono">
                      {optionLetter(i)}
                    </span>
                    {question?.options?.[i] && (
                      <span className="text-ink min-w-0 break-words">
                        {question.options[i]}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            ) : (
              <Textarea
                aria-labelledby={headId}
                rows={4}
                value={answer?.text ?? ""}
                onChange={(e) =>
                  onChange?.(entry.key, { text: e.target.value })
                }
                maxLength={20_000}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
