/**
 * The floor axis: what a floor is called, and how a list of rooms is cut into
 * one band per floor.
 *
 * The wording lives here rather than beside the markup because two places say
 * it — the address under a room's number on its card, and the heading over the
 * band that card sits in — and a card reading "floor 2" beneath a heading
 * reading "2nd floor" would look like two different facts about the same room.
 *
 * One thing a reader cannot see from here: at SICSR the floor is read off the
 * room number by `floorOf` in `src/lib/sicsr.ts`, whose `/^(\d)\d{2}$/` matches
 * only a bare three-digit code — so every named space (SDRC, the Terrace) is
 * imported as floor 0 and lands under "Ground floor", which is a guess in the
 * Terrace's case and plainly wrong. Widening that regex is the import's job,
 * not this screen's; here it only means floor 0 is the untidy band.
 */

/** As much of a room as the floor axis needs. */
export interface FloorRoom {
  floor: number;
  building: { id: string; name: string };
}

/** One floor of one building, and the rooms found on it. */
export interface FloorSection<T> {
  /**
   * `buildingId:floor`. The key is the identity React sorts the bands by, and
   * it has to survive a keystroke in the search box emptying the band next to
   * it — an array index would not, and the cards would be re-parented on every
   * letter typed, flickering their plates and status badges.
   */
  key: string;
  floor: number;
  building: { id: string; name: string };
  rooms: T[];
}

/**
 * "Floor 2", "Ground floor", "Basement" — the heading over a band.
 *
 * Cardinals rather than ordinals: "Floor 2" sits over a plate reading `203`
 * with no arithmetic in between, and it sidesteps 1st/2nd/3rd/11th. The schema
 * admits −2 to 50 (`roomInput` in the rooms router), so the negatives are
 * reachable by an administrator even though nothing at SICSR is below ground;
 * past −2 is reachable only by writing to the database directly, and is spelled
 * out rather than left to fall through to "Floor -3".
 */
export function floorLabel(floor: number): string {
  if (floor > 0) return `Floor ${floor}`;
  if (floor === 0) return "Ground floor";
  if (floor === -1) return "Basement";
  if (floor === -2) return "Sub-basement";
  return `Basement ${-floor}`;
}

/** The same floor, said mid-sentence: "SICSR · ground", "SICSR · floor 2". */
export function floorAddress(floor: number): string {
  if (floor > 0) return `floor ${floor}`;
  if (floor === 0) return "ground";
  if (floor === -1) return "basement";
  if (floor === -2) return "sub-basement";
  return `basement ${-floor}`;
}

/**
 * Whether a search was asking for this floor by name.
 *
 * Spelt out rather than left to `includes`, which is wrong twice over. "2" sits
 * inside "floor 2", so a search for a room number would answer with every room
 * on the floor that number begins with — and a room number is what almost every
 * search on this screen is. A single letter sits inside "floor" and "ground",
 * so typing "o" would return the entire estate before the second keystroke.
 *
 * So: only the start of what a floor is called, and only once three characters
 * have been typed, which is past every code and every accident and into the
 * short list of words this can be — "ground floor", "floor 3", "basement".
 */
export function matchesFloor(floor: number, needle: string): boolean {
  if (needle.length < 3) return false;
  return (
    floorAddress(floor).startsWith(needle) ||
    floorLabel(floor).toLowerCase().startsWith(needle)
  );
}

/**
 * Cuts rooms into bands, one per floor of one building.
 *
 * Keyed on the building as well as the floor because "which floor am I on" is
 * only a question inside a single building — you cannot walk from Ashby's
 * second to Kepler's — and the codes already say as much (`A-201`, `K-Lab2`).
 * At SICSR, which is one building, this collapses to a plain floor grouping.
 *
 * The Map is what keeps the server's order — `building.name` then `code` — a
 * band's rooms come out in the order they went in, and only the list of bands
 * needs sorting, because insertion order gives floors in the order they were
 * first seen rather than in the order they are stacked.
 */
export function floorSections<T extends FloorRoom>(
  rooms: readonly T[],
): FloorSection<T>[] {
  const bands = new Map<string, FloorSection<T>>();
  for (const room of rooms) {
    const key = `${room.building.id}:${room.floor}`;
    const band = bands.get(key);
    if (band) band.rooms.push(room);
    else
      bands.set(key, {
        key,
        floor: room.floor,
        building: room.building,
        rooms: [room],
      });
  }

  // Strictly ascending, basements included, with no special case for the
  // ground. A floor axis is monotonic and reads as one: the lift-panel order —
  // ground, up, then the basements at the bottom — puts B1 below floor 7 and
  // reads as a mistake.
  return [...bands.values()].sort(
    (a, b) =>
      a.building.name.localeCompare(b.building.name) || a.floor - b.floor,
  );
}
