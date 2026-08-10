import { Icon, type IconName } from "./icon";

export type StatTone = "slate" | "red" | "green" | "orange" | "violet";

const TONE_HEX: Record<StatTone, string> = {
  slate: "#445879",
  red: "#dc3848",
  green: "#4e7d3a",
  orange: "#f6a73b",
  violet: "#7a2e8f",
};

/** Headline number with a label, an icon chip and an optional delta pill. */
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
  const hex = TONE_HEX[tone];
  return (
    <div
      className="bg-surface rounded-[var(--radius-card)] p-[18px]"
      style={{ boxShadow: "var(--ring), var(--shadow-card)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-muted text-[12.5px] font-medium">{label}</span>
        {icon && (
          <span
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]"
            style={{ background: `color-mix(in srgb, ${hex} 14%, #fff)` }}
          >
            <Icon name={icon} size={16} color={hex} stroke={1.9} />
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="font-display text-title text-[28px] leading-none font-bold tracking-[-0.02em]">
          {value}
        </span>
        {delta && (
          <span
            className="text-[12px] font-bold"
            style={{ color: TONE_HEX[deltaTone] }}
          >
            {delta}
          </span>
        )}
      </div>

      {note && (
        <div className="text-faint mt-1.5 font-mono text-[11.5px]">{note}</div>
      )}
    </div>
  );
}
