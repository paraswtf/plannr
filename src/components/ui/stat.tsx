import { Icon, type IconName } from "./icon";

export type StatTone = "slate" | "red" | "green" | "orange" | "violet";

const TONE_HEX: Record<StatTone, string> = {
  slate: "#445879",
  red: "#dc3848",
  green: "#4e7d3a",
  orange: "#f6a73b",
  violet: "#7a2e8f",
};

/*
 * Words in a tone have to be readable, which the bright half of the palette
 * is not: orange at 11px on white is 2:1. The glyph keeps the bright colour,
 * where it is a shape rather than text; the delta is set in the state's ink.
 */
const TONE_INK: Record<StatTone, string> = {
  slate: "var(--info-ink)",
  red: "var(--bad-ink)",
  green: "var(--good-ink)",
  orange: "var(--warn-ink)",
  violet: "#6b2880",
};

/**
 * Headline number with a label, an optional glyph and an optional delta.
 *
 * The number is the point, so it leads: display face, tabular figures so a
 * column of these lines up digit for digit, and everything else stepped down
 * in size and ink beneath it. The glyph is small and sits beside the label
 * rather than on a coloured plate of its own — a row of tinted icon chips is
 * the dashboard everyone has seen, and the chip said nothing the label did not.
 */
export function Stat({
  label,
  value,
  note,
  icon,
  tone = "slate",
  delta,
  deltaTone = "green",
}: {
  label: string;
  value: string | number;
  note?: string;
  icon?: IconName;
  tone?: StatTone;
  delta?: string;
  deltaTone?: StatTone;
}) {
  return (
    <div className="bg-surface rounded-[var(--radius-card)] p-[18px] shadow-[var(--ring),var(--shadow-card)]">
      <div className="flex items-center gap-1.5">
        {icon && (
          <Icon name={icon} size={14} color={TONE_HEX[tone]} stroke={2} />
        )}
        <span className="text-muted text-xs font-medium">{label}</span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-title text-[28px] leading-none font-semibold tracking-[-0.025em] tabular-nums">
          {value}
        </span>
        {delta && (
          <span
            className="text-xs font-semibold"
            style={{ color: TONE_INK[deltaTone] }}
          >
            {delta}
          </span>
        )}
      </div>

      {note && <div className="text-faint mt-2 text-xs">{note}</div>}
    </div>
  );
}
