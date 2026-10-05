import { speakerColor, STAKEHOLDERS, TEAM } from "~/content/team";
import type { SpeakerId, StakeholderId } from "~/deck/types";

import { Icon } from "./icon";

/** A presenter's face, or their initial in their colour until a photo is in. */
export function Avatar({
  person,
  size = 40,
  flipId,
  className,
}: {
  person: SpeakerId;
  size?: number;
  flipId?: string;
  className?: string;
}) {
  const p = TEAM[person];
  const color = speakerColor(person);
  return (
    <span
      data-flip-id={flipId}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 22%, var(--bg-raised))`,
        boxShadow: `inset 0 0 0 ${Math.max(1, size / 28)}px color-mix(in srgb, ${color} 70%, transparent)`,
        color,
      }}
    >
      {p.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.photo}
          alt={p.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-display font-bold"
          style={{ fontSize: size * 0.44, letterSpacing: "-0.02em" }}
        >
          {p.name[0]}
        </span>
      )}
    </span>
  );
}

/** Avatar and name: who is talking. */
export function SpeakerChip({
  person,
  size = 40,
  label,
  flipId,
  className,
}: {
  person: SpeakerId;
  size?: number;
  /** Small line under the name, e.g. "Students". */
  label?: string;
  flipId?: string;
  className?: string;
}) {
  return (
    <span
      data-flip-id={flipId}
      className={`inline-flex items-center gap-3 ${className ?? ""}`}
    >
      <Avatar person={person} size={size} />
      <span className="flex flex-col leading-none">
        <span
          className="font-display font-semibold"
          style={{ fontSize: size * 0.48 }}
        >
          {TEAM[person].name}
        </span>
        {label && (
          <span
            className="t-mono text-muted mt-1.5"
            style={{ fontSize: Math.max(13, size * 0.32) }}
          >
            {label}
          </span>
        )}
      </span>
    </span>
  );
}

/** A small rounded tag in a stakeholder's colour: icon and name. */
export function StakeholderTag({
  stakeholder,
  size = 22,
  className,
  flipId,
}: {
  stakeholder: StakeholderId;
  size?: number;
  className?: string;
  flipId?: string;
}) {
  const s = STAKEHOLDERS[stakeholder];
  return (
    <span
      data-flip-id={flipId}
      className={`inline-flex items-center gap-2 rounded-full font-semibold ${className ?? ""}`}
      style={{
        fontSize: size,
        padding: `${size * 0.32}px ${size * 0.7}px ${size * 0.32}px ${size * 0.5}px`,
        color: s.color,
        background: `color-mix(in srgb, ${s.color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${s.color} 36%, transparent)`,
      }}
    >
      <Icon name={s.icon} size={size * 1.05} stroke={2} />
      {s.title}
    </span>
  );
}
