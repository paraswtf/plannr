import { describe, expect, it } from "vitest";

import {
  floorAddress,
  floorLabel,
  floorSections,
  matchesFloor,
} from "./room-floors";

/**
 * The floor axis the rooms screen bands itself on.
 *
 * Two claims are worth pinning. The wording is one: a heading and the address
 * on the card beneath it are generated from the same number, and the whole
 * reason they live in one module is that they must not come to disagree. The
 * cut is the other: a band is a floor *of a building*, bands stack in the order
 * the building does, and within one the server's order survives untouched —
 * which is what stops the cards being re-sorted in front of somebody who is
 * mid-search.
 *
 * The rooms in here are real: the SICSR set pinned in `src/lib/sicsr.test.ts`,
 * whose floors the importer reads off the number, and the hyphenated codes the
 * demo seed uses, whose floors are typed in by hand.
 */

const SICSR = { id: "b-sicsr", name: "SICSR" };
const ASHBY = { id: "b-ashby", name: "Ashby Hall" };
const KEPLER = { id: "b-kepler", name: "Kepler Building" };

const room = (code: string, floor: number, building = SICSR) => ({
  code,
  floor,
  building,
});

describe("floorLabel", () => {
  it("counts floors rather than ordering them", () => {
    // "Floor 2" over a plate reading 203 needs no arithmetic in between, and
    // there is no 1st/2nd/3rd/11th to get wrong.
    expect(floorLabel(2)).toBe("Floor 2");
    expect(floorLabel(7)).toBe("Floor 7");
  });

  it("names the ground and what is under it", () => {
    expect(floorLabel(0)).toBe("Ground floor");
    expect(floorLabel(-1)).toBe("Basement");
    expect(floorLabel(-2)).toBe("Sub-basement");
  });

  it("never falls through to a negative floor number", () => {
    // -2 is as low as the API goes, so this is only reachable by writing to the
    // database directly — but "Floor -3" is the one answer that must not appear.
    expect(floorLabel(-3)).toBe("Basement 3");
  });
});

describe("floorAddress", () => {
  it("says the same floor mid-sentence", () => {
    expect(floorAddress(2)).toBe("floor 2");
    expect(floorAddress(0)).toBe("ground");
    expect(floorAddress(-1)).toBe("basement");
  });

  it("agrees with the heading over it, at every floor", () => {
    // The contract the module exists for: same number in, same floor named.
    for (const floor of [-3, -2, -1, 0, 1, 2, 3, 7, 50]) {
      expect(floorLabel(floor).toLowerCase()).toContain(floorAddress(floor));
    }
  });
});

describe("matchesFloor", () => {
  it("answers the words somebody would actually type", () => {
    expect(matchesFloor(0, "ground")).toBe(true);
    expect(matchesFloor(0, "ground floor")).toBe(true);
    expect(matchesFloor(3, "floor 3")).toBe(true);
    expect(matchesFloor(-1, "basement")).toBe(true);
    expect(matchesFloor(-2, "sub")).toBe(true);
  });

  it("does not answer a room number with the floor it starts with", () => {
    // The reason this is not `includes`: "2" is inside "floor 2", and almost
    // every search on this screen is a room code.
    expect(matchesFloor(2, "2")).toBe(false);
    expect(matchesFloor(2, "203")).toBe(false);
    expect(matchesFloor(7, "707")).toBe(false);
  });

  it("does not return the whole estate for one letter of the word", () => {
    for (const letter of ["f", "l", "o", "r", "g", "oo", "or"]) {
      expect(matchesFloor(3, letter)).toBe(false);
      expect(matchesFloor(0, letter)).toBe(false);
    }
  });

  it("matches from the start of the name, never the middle", () => {
    expect(matchesFloor(3, "oor 3")).toBe(false);
    expect(matchesFloor(0, "round")).toBe(false);
  });
});

describe("floorSections", () => {
  it("stacks a college's floors in the order they are stacked", () => {
    const bands = floorSections([
      room("707", 7),
      room("203", 2),
      room("SDRC", 0),
      room("404", 4),
      room("307", 3),
    ]);
    expect(bands.map((b) => b.floor)).toEqual([0, 2, 3, 4, 7]);
  });

  it("puts the basements below the ground rather than after the top floor", () => {
    const bands = floorSections([
      room("301", 3),
      room("B-02", -1),
      room("G", 0),
    ]);
    expect(bands.map((b) => b.floor)).toEqual([-1, 0, 3]);
  });

  it("keeps the order the server sent inside a band", () => {
    const bands = floorSections([
      room("303", 3),
      room("301", 3),
      room("307", 3),
    ]);
    expect(bands[0]!.rooms.map((r) => r.code)).toEqual(["303", "301", "307"]);
  });

  it("does not join two buildings' second floors into one", () => {
    // You cannot walk from Ashby's second to Kepler's, and the codes already
    // say so.
    const bands = floorSections([
      room("A-201", 2, ASHBY),
      room("K-Lab2", 2, KEPLER),
    ]);
    expect(bands).toHaveLength(2);
    expect(bands.map((b) => b.building.name)).toEqual([
      "Ashby Hall",
      "Kepler Building",
    ]);
  });

  it("reads a building at a time, floors ascending within each", () => {
    const bands = floorSections([
      room("K-301", 3, KEPLER),
      room("A-101", 1, ASHBY),
      room("K-Aud", 1, KEPLER),
      room("A-Smart", 3, ASHBY),
    ]);
    expect(bands.map((b) => `${b.building.name} ${b.floor}`)).toEqual([
      "Ashby Hall 1",
      "Ashby Hall 3",
      "Kepler Building 1",
      "Kepler Building 3",
    ]);
  });

  it("gives every band a key of its own, and the same one every time", () => {
    // The key is what React re-parents by. Two floors that only differ by
    // building must not collide, and a keystroke in the search box that empties
    // the band above must not renumber the one below it into somebody else's
    // cards — which is what an array index would have done.
    const estate = [
      room("A-201", 2, ASHBY),
      room("K-Lab2", 2, KEPLER),
      room("A-101", 1, ASHBY),
    ];
    const keys = floorSections(estate).map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);

    // The same floor of the same building, reached with the band above it gone.
    const before = floorSections(estate).find((b) => b.building === KEPLER);
    const after = floorSections([room("K-Lab2", 2, KEPLER)])[0];
    expect(after!.key).toBe(before!.key);
  });

  it("gives one band back when the importer could read no floors at all", () => {
    // An MRBS export of "Room 203"-style codes defeats `floorOf` and lands the
    // whole estate on floor 0. The screen leans on this count to draw itself
    // flat instead of claiming they are all on the ground.
    const bands = floorSections([
      room("Room 203", 0),
      room("Terrace", 0),
      room("SDRC", 0),
    ]);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.rooms).toHaveLength(3);
  });

  it("has no bands for no rooms", () => {
    expect(floorSections([])).toEqual([]);
  });
});
