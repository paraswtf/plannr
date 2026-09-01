export type PlaqueScale = "card" | "row";

/*
 * Where the size steps come from.
 *
 * Almost every room the college has is a three-digit number — 203, 307, 404,
 * the set pinned in `src/lib/sicsr.test.ts` — and the top step is as large as
 * three digits can be drawn while a 268px card still has room for its status
 * badge beside them. The rest of the estate is named rather than numbered
 * ("SDRC", "Terrace", and the seed's "T-Studio"), and each further step is the
 * largest size at which that many characters still clear the plate's width cap.
 *
 * Steps rather than a formula: these were measured against the codes actually
 * in the export, and a curve fitted through them would only be a worse fit at
 * every point that matters.
 */
const STEPS: Record<
  PlaqueScale,
  readonly [number, number, number, number, number]
> = {
  card: [34, 30, 24, 19, 14],
  row: [19, 17.5, 15, 13, 11.5],
};

/** How big this code can be drawn on a plate of the given scale, in px. */
export function plaqueSize(code: string, scale: PlaqueScale = "card"): number {
  const length = code.trim().length;
  // Annotated so the tuple lookup is total: `noUncheckedIndexedAccess` would
  // otherwise widen a computed index to `number | undefined`.
  const step: 0 | 1 | 2 | 3 | 4 =
    length <= 3 ? 0 : length === 4 ? 1 : length <= 6 ? 2 : length <= 9 ? 3 : 4;
  return STEPS[scale][step];
}

/**
 * A room's number, drawn the way the plate on its door is.
 *
 * The fill-plus-ring pair is the house idiom — the same shape as a Card's own
 * `--ring`, and as `--mine-fill`/`--mine-ring` on the timetable — and it is what
 * makes this read as a plate rather than as a highlight. Deliberately neutral
 * slate on every room: tinting it by occupancy was the obvious alternative, but
 * the badge beside it already carries the status with a dot, and forty traffic
 * lights on one screen is noise where the point is a single unambiguous anchor.
 *
 * `tabular-nums` is doing more work than it looks. It makes every three-digit
 * code exactly the same width, so every numeric plate in the grid is the same
 * size and the eye runs down a fixed column of tiles rather than a ragged one.
 */
export function RoomPlaque({
  code,
  scale = "card",
}: {
  code: string;
  scale?: PlaqueScale;
}) {
  const size = plaqueSize(code, scale);
  const big = scale === "card";

  return (
    <span
      title={code}
      className={`font-display text-title flex shrink-0 items-center justify-center font-bold tabular-nums ${
        big
          ? "min-h-16 min-w-16 rounded-[12px] px-2.5"
          : "min-h-9 min-w-11 rounded-[9px] px-2 sm:min-w-[72px]"
      }`}
      style={{
        background: "var(--card-soft)",
        boxShadow: "inset 0 0 0 1px var(--hair)",
        fontSize: `${size}px`,
        lineHeight: 1,
        // Tracking follows the size rather than being fixed: -0.03em tightens a
        // 34px number nicely and starts closing 14px letters into each other.
        letterSpacing: size >= 24 ? "-0.03em" : "-0.01em",
        // The plate grows with the code, but never so far that the status
        // column beside it has nowhere to go. Past this the code truncates
        // instead — which the ladder means takes about thirteen characters,
        // longer than anything the college has ever named a room.
        maxWidth: big ? "min(150px, 52%)" : "160px",
      }}
    >
      {/*
       * The inner span is what actually ellipsises. The plate is `shrink-0` so
       * it never gives width away to its siblings, and the cap above plus this
       * `min-w-0` is what gives the overflow somewhere to happen. The `title`
       * on the plate means a truncated code is still recoverable on hover, and
       * the text node is intact for a screen reader either way.
       */}
      <span className="min-w-0 truncate">{code}</span>
    </span>
  );
}
