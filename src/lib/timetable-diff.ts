/**
 * Comparing a day of our timetable against a day of the college's.
 *
 * This is the arithmetic behind `db:verify-schedule`, kept apart from the
 * fetching and the printing because it is the part that can be wrong in ways
 * nobody notices. Every mistake it has made so far has been a *false pass* —
 * the two databases disagreed and the check said they matched — which is the
 * one failure a gate must not have, and the one that is invisible without
 * tests. So the rules live here, in a pure function, with a case pinned for
 * each way it has been fooled.
 *
 * The rules, in order of how easily they are got wrong:
 *
 *   1. Compare classes, not slots. Two classes can share a room and an hour.
 *      Counting how many sittings each side has at a slot lets a duplicate on
 *      one side stand in for something missing on the other.
 *   2. Where both sides have something left over in the same slot, that is one
 *      class read two ways — not one missing and one invented.
 *   3. A class called off here is a difference we made on purpose, and only
 *      excuses the college row it actually corresponds to.
 */

/** One class, as either side holds it. */
export interface Sitting {
  /** Room and clock times — "704 10:30–11:30". */
  slot: string;
  /** The line the college typed, whitespace collapsed. */
  text: string;
}

export interface DayDiff {
  /** Classes both sides hold, with the same line. */
  matched: number;
  /** The college holds these; we do not, and did not call them off. */
  missing: Sitting[];
  /** We hold these; the college does not. */
  unexpected: Sitting[];
  /** Both sides hold a class here, and read it differently. */
  differs: Array<{ slot: string; college: string; here: string }>;
  /** College rows accounted for by a class called off here. */
  excused: number;
}

/** How many of each distinct value a list holds. */
function tally(items: Sitting[], slot: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.slot !== slot) continue;
    counts.set(item.text, (counts.get(item.text) ?? 0) + 1);
  }
  return counts;
}

/** Everything in `mine` that `yours` does not also have, one entry per copy. */
function surplus(
  mine: Map<string, number>,
  yours: Map<string, number>,
): string[] {
  const left: string[] = [];
  for (const [text, n] of mine) {
    const spare = n - (yours.get(text) ?? 0);
    for (let i = 0; i < spare; i++) left.push(text);
  }
  return left;
}

/**
 * What one day of the college's timetable and one day of ours disagree about.
 *
 * `cancelled` is the sittings called off in the app — deliberately absent from
 * our side and deliberately still on the college's, since the college was never
 * told. Each one excuses at most one college row, and only a row that says the
 * same thing: a cancelled lecture is no reason to overlook a *different* class
 * the college has since put in that room at that hour.
 */
export function compareDay(
  live: Sitting[],
  ours: Sitting[],
  cancelled: Sitting[] = [],
): DayDiff {
  const diff: DayDiff = {
    matched: 0,
    missing: [],
    unexpected: [],
    differs: [],
    excused: 0,
  };
  const slots = [
    ...new Set([...live, ...ours].map((sitting) => sitting.slot)),
  ].sort();

  for (const slot of slots) {
    const theirs = tally(live, slot);
    const mine = tally(ours, slot);

    for (const [text, n] of theirs)
      diff.matched += Math.min(n, mine.get(text) ?? 0);

    const theirSurplus = surplus(theirs, mine);
    const ourSurplus = surplus(mine, theirs);

    while (theirSurplus.length > 0 && ourSurplus.length > 0) {
      diff.differs.push({
        slot,
        college: theirSurplus.shift()!,
        here: ourSurplus.shift()!,
      });
    }

    const calledOff = tally(cancelled, slot);
    for (const text of theirSurplus) {
      const off = calledOff.get(text) ?? 0;
      if (off > 0) {
        calledOff.set(text, off - 1);
        diff.excused++;
        continue;
      }
      diff.missing.push({ slot, text });
    }
    for (const text of ourSurplus) diff.unexpected.push({ slot, text });
  }

  return diff;
}

/** Whether a day's comparison found anything wrong. */
export const disagrees = (diff: DayDiff): number =>
  diff.missing.length + diff.unexpected.length + diff.differs.length;
