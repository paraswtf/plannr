import { describe, expect, it } from "vitest";

import { initialsOf } from "./entity-card";

/**
 * The two letters an avatar shows.
 *
 * Worth its own file for one reason: the title-stripping is a regex over
 * somebody's name, and a regex that is slightly too greedy does not fail — it
 * quietly initials the wrong person, on a screen where the initials are the
 * whole identifier.
 */

describe("initialsOf", () => {
  it("takes the first and last of a full name", () => {
    expect(initialsOf("Anagha Gosavi")).toBe("AG");
    expect(initialsOf("Abel Varghese Roy")).toBe("AR");
  });

  it("drops a title, so two lecturers are not both DR", () => {
    expect(initialsOf("Dr Rao")).toBe("RA");
    expect(initialsOf("Dr. Anjali Rao")).toBe("AR");
    expect(initialsOf("Prof. Iyer")).toBe("IY");
    expect(initialsOf("Mrs Gupta")).toBe("GU");
  });

  it("does not mistake the start of a name for a title", () => {
    /*
     * The bug this file exists for. The separator after the title used to be
     * optional, which made it a prefix match on the letters alone — so Drishti
     * was initialled as "ishti" and Mrinal as "inal". Both are names this
     * college has plenty of, and neither would ever have been reported: it is
     * two letters on an avatar, and they look like somebody's initials.
     */
    expect(initialsOf("Drishti Sharma")).toBe("DS");
    expect(initialsOf("Mrinal Kulkarni")).toBe("MK");
    expect(initialsOf("Mrudula Shete")).toBe("MS");
    expect(initialsOf("Prasad Joshi")).toBe("PJ");
    expect(initialsOf("Msimbi Ndlovu")).toBe("MN");
  });

  it("falls back rather than showing nothing", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
    // A title and nothing else is not a name, but it is better than a "?".
    expect(initialsOf("Priya")).toBe("PR");
  });
});
