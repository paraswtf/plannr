/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { plaqueSize, RoomPlaque } from "./room-plaque";

/**
 * The size ladder, and the two things about the plate that are contracts rather
 * than styling.
 *
 * Every code in here was taken from somewhere real — the live SICSR set pinned
 * in `src/lib/sicsr.test.ts`, and the hyphenated codes the demo seed uses — not
 * invented, because the whole design is tuned to what the export actually
 * contains rather than to a hypothetical distribution.
 *
 * The exact pixel values are asserted only as an ordering plus a floor, bar one
 * deliberate exception: a restyle should be free to move them so long as a
 * three-digit code stays the largest thing on the card, which is the point of
 * the change.
 */

/** The whole vocabulary, shortest first. */
const VOCABULARY = [
  "403",
  "SDRC",
  "A-101",
  "K-Lab2",
  "Terrace",
  "T-Studio",
  "Seminar Hall",
];

afterEach(cleanup);

describe("plaqueSize", () => {
  it("gives every real SICSR room the top step", () => {
    for (const code of [
      "203",
      "207",
      "301",
      "303",
      "304",
      "305",
      "307",
      "404",
    ]) {
      expect(plaqueSize(code)).toBe(34);
    }
  });

  it("never grows as the code gets longer", () => {
    const sizes = VOCABULARY.map((code) => plaqueSize(code));
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]!);
    }
  });

  it("leaves no real room smaller than it used to be drawn", () => {
    // The code was 19px flat before the plate existed. Nothing up to nine
    // characters — which covers everything the college has ever named a room —
    // comes out below that.
    expect(plaqueSize("T-Studio")).toBeGreaterThanOrEqual(19);
  });

  it("does not let padding cost a code a step", () => {
    // Codes are imported from a hand-typed grid, and the import trims — but
    // this must not depend on its having done so.
    expect(plaqueSize(" 403 ")).toBe(plaqueSize("403"));
  });

  it("draws a row smaller than a card, at every length", () => {
    for (const code of VOCABULARY) {
      expect(plaqueSize(code, "row")).toBeLessThan(plaqueSize(code, "card"));
    }
  });
});

describe("RoomPlaque", () => {
  it("keeps the whole code even when the plate would truncate it", () => {
    render(<RoomPlaque code="Seminar Hall" />);
    // Both halves matter: the text node is what a screen reader gets, and the
    // title is what recovers the code for a sighted reader when the ellipsis
    // bites.
    expect(screen.getByText("Seminar Hall")).toBeInTheDocument();
    expect(screen.getByTitle("Seminar Hall")).toBeInTheDocument();
  });

  it("draws a three-digit room at the top step", () => {
    render(<RoomPlaque code="403" />);
    // The one pixel assertion in the suite, because that number is the point.
    expect(screen.getByTitle("403")).toHaveStyle({ fontSize: "34px" });
  });
});
