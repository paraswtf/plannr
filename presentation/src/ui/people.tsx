import { STAKEHOLDERS, TEAM } from "~/content/team";
import type { SpeakerId, StakeholderId } from "~/deck/types";

import { Icon } from "./icon";

/**
 * A presenter's face, or their initial until a photo is in. A rounded square
 * rather than a circle, with plain px and hex styles so it can travel in a
 * morph.
 */
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
  return (
    <span
      data-flip-id={flipId}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: "#e3e6ec",
        boxShadow: "inset 0 0 0 1px rgba(16, 24, 40, 0.08)",
        color: "#10141b",
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
          className="font-display font-semibold"
          style={{ fontSize: size * 0.42, letterSpacing: "-0.02em" }}
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
          className="font-display text-fg font-medium"
          style={{ fontSize: size * 0.46 }}
        >
          {TEAM[person].name}
        </span>
        {label && (
          <span
            className="t-label text-muted mt-1.5"
            style={{ fontSize: Math.max(14, size * 0.34) }}
          >
            {label}
          </span>
        )}
      </span>
    </span>
  );
}

/** A small tag naming a stakeholder: icon and title, in the accent. */
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
      className={`text-accent bg-accent-soft inline-flex items-center gap-2 font-medium ${className ?? ""}`}
      style={{
        fontSize: size,
        borderRadius: 12,
        padding: `${size * 0.3}px ${size * 0.62}px ${size * 0.3}px ${size * 0.46}px`,
      }}
    >
      <Icon name={s.icon} size={size * 1.05} />
      {s.title}
    </span>
  );
}
