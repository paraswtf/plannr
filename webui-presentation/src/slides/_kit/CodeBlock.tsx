import type { ReactNode } from "react";

const KEYWORDS =
  /^(const|let|var|function|return|if|else|await|async|import|from|export|new|type|interface|throw|true|false|null|undefined|for|of|in)$/;

/** Splits one line into comment / string / number / word / other tokens. */
function tokens(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+|.)/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(line))) {
    const [t, com, str, num, word] = m;
    if (com)
      out.push(
        <span key={i} className="text-faint">
          {t}
        </span>,
      );
    else if (str)
      out.push(
        <span key={i} className="text-accent">
          {t}
        </span>,
      );
    else if (num)
      out.push(
        <span key={i} className="text-fg">
          {t}
        </span>,
      );
    else if (word && KEYWORDS.test(word))
      out.push(
        <span key={i} className="text-fg font-bold">
          {t}
        </span>,
      );
    else out.push(<span key={i}>{t}</span>);
    i += 1;
  }
  return out;
}

/**
 * A short code snippet, monospace, lightly highlighted with the deck's tokens
 * (keywords bold, strings in the accent, comments faint). No external lib.
 * Keep to ~12 lines at `size` 24. `mark` lists 1-based lines to highlight.
 */
export function CodeBlock({
  code,
  title,
  mark = [],
  size = 24,
  className,
}: {
  code: string;
  /** File name shown in the header, e.g. "src/server/auth/config.ts". */
  title?: string;
  mark?: number[];
  size?: number;
  className?: string;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div
      className={`bg-raised overflow-hidden rounded-[22px] shadow-[inset_0_0_0_1px_var(--line),var(--shadow-1)] ${className ?? ""}`}
    >
      {title && (
        <div
          className="t-mono text-muted border-b px-6 py-3 text-[20px]"
          style={{ borderColor: "var(--line)" }}
        >
          {title}
        </div>
      )}
      <pre
        className="t-mono text-body m-0 px-0 py-4 leading-[1.5]"
        style={{ fontSize: size }}
      >
        {lines.map((l, n) => (
          <div
            key={n}
            className={`px-6 whitespace-pre ${mark.includes(n + 1) ? "bg-accent-soft" : ""}`}
          >
            {tokens(l)}
            {l === "" && " "}
          </div>
        ))}
      </pre>
    </div>
  );
}
