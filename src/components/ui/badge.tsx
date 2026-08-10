import type { ReactNode } from "react";

export type BadgeTone =
  "neutral" | "slate" | "red" | "green" | "orange" | "gradient";

const TONES: Record<BadgeTone, { background: string; color: string }> = {
  neutral: { background: "rgba(44,49,53,0.07)", color: "var(--muted)" },
  slate: { background: "rgba(68,88,121,0.10)", color: "#324464" },
  red: { background: "rgba(220,56,72,0.10)", color: "#b02636" },
  green: { background: "rgba(78,125,58,0.12)", color: "#3f6a2e" },
  orange: { background: "rgba(246,167,59,0.16)", color: "#a2660f" },
  gradient: { background: "var(--grad-brand)", color: "#fff" },
};

const DOT_COLOR: Partial<Record<BadgeTone, string>> = {
  red: "var(--red)",
  green: "#4e7d3a",
  orange: "var(--orange)",
  slate: "var(--slate)",
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap"
      style={TONES[tone]}
    >
      {dot && (
        <span
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: DOT_COLOR[tone] ?? "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}
