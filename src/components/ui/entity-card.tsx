"use client";

import { Badge, type BadgeTone } from "./badge";
import { Icon, type IconName } from "./icon";

/**
 * What one search result looks like.
 *
 * The autocomplete never inspects the row it is given — callers turn a row into
 * one of these, which is the only seam between a generic control and a specific
 * entity. Keeping `label` plain text matters: it is what the closed trigger and
 * the chips display, where JSX would not fit.
 */
export interface EntityCard {
  /** Plain text for the chip and the closed trigger. */
  label: string;
  avatar?:
    | { kind: "initials"; text: string }
    | { kind: "icon"; name: IconName; tone?: string };
  title: string;
  subtitle?: string | null;
  /** At most three are drawn; the rest are dropped rather than wrapping. */
  badges?: Array<{ text: string; tone?: BadgeTone; dot?: boolean }>;
  /** Mono micro-facts joined with a middot: counts, capacities, PRNs. */
  meta?: string[];
}

/** Initials for a person or a code, with any honorific stripped. */
export function initialsOf(name: string): string {
  // The separator is required, not optional. `\s*` made this a prefix match on
  // the letters alone, so Drishti became "ishti" and Mrinal became "inal" —
  // names this college has plenty of, initialled as somebody else entirely. A
  // title is a word, so it is followed by a space or a full stop or it was
  // never a title.
  const cleaned = name.replace(/^(Dr|Prof|Ms|Mr|Mrs)(\.\s*|\s+)/i, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function EntityCardAvatar({
  avatar,
}: {
  avatar: NonNullable<EntityCard["avatar"]>;
}) {
  if (avatar.kind === "icon") {
    const tone = avatar.tone ?? "var(--slate)";
    return (
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
        style={{ background: `color-mix(in srgb, ${tone} 12%, #fff)` }}
      >
        <Icon name={avatar.name} size={15} color={tone} stroke={1.9} />
      </span>
    );
  }
  // A person is a rounded square in the selected wash, as `Avatar` draws
  // them; a list of results is a list of other people, and forty solid slate
  // discs down a dropdown were forty dark blots.
  return (
    <span className="bg-tint-strong text-slate-ink text-2xs flex h-7 w-7 shrink-0 items-center justify-center rounded-[30%] font-semibold shadow-[inset_0_0_0_1px_var(--hair-soft)]">
      {avatar.text}
    </span>
  );
}

/** The body of one result. Shared by the single and multi variants. */
export function EntityCardBody({ card }: { card: EntityCard }) {
  return (
    <>
      {card.avatar && <EntityCardAvatar avatar={card.avatar} />}
      <span className="min-w-0 flex-1">
        {/*
         * Badges never shrink, so on a narrow result the title would otherwise
         * truncate away to nothing to make room for them. Letting the row wrap
         * drops them onto a second line instead, and costs nothing where there
         * is space for one.
         */}
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-title min-w-0 flex-1 truncate text-sm font-semibold">
            {card.title}
          </span>
          {card.badges?.slice(0, 3).map((b) => (
            <Badge key={b.text} tone={b.tone ?? "neutral"} dot={b.dot}>
              {b.text}
            </Badge>
          ))}
        </span>
        {card.subtitle && (
          <span className="text-muted mt-0.5 block truncate text-xs">
            {card.subtitle}
          </span>
        )}
        {card.meta && card.meta.length > 0 && (
          <span className="text-faint mt-1 block truncate font-mono text-xs">
            {card.meta.join(" · ")}
          </span>
        )}
      </span>
    </>
  );
}
