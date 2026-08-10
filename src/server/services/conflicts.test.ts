import { describe, expect, it } from "vitest";

import { intersectOccurrences, overlaps } from "./conflicts";

const at = (iso: string) => new Date(iso);
const slot = (startIso: string, endIso: string) => ({
  start: at(startIso),
  end: at(endIso),
});

describe("overlaps", () => {
  it("detects a genuine overlap", () => {
    expect(
      overlaps(
        at("2026-10-13T09:00Z"),
        at("2026-10-13T10:00Z"),
        at("2026-10-13T09:30Z"),
        at("2026-10-13T10:30Z"),
      ),
    ).toBe(true);
  });

  it("treats back-to-back bookings as free", () => {
    // A class ending at 10:00 does not clash with one starting at 10:00 —
    // this is the boundary that decides whether the grid is usable at all.
    expect(
      overlaps(
        at("2026-10-13T09:00Z"),
        at("2026-10-13T10:00Z"),
        at("2026-10-13T10:00Z"),
        at("2026-10-13T11:00Z"),
      ),
    ).toBe(false);
  });

  it("detects full containment in both directions", () => {
    const outer = [at("2026-10-13T09:00Z"), at("2026-10-13T12:00Z")] as const;
    const inner = [at("2026-10-13T10:00Z"), at("2026-10-13T11:00Z")] as const;
    expect(overlaps(outer[0], outer[1], inner[0], inner[1])).toBe(true);
    expect(overlaps(inner[0], inner[1], outer[0], outer[1])).toBe(true);
  });

  it("reports disjoint ranges as free", () => {
    expect(
      overlaps(
        at("2026-10-13T09:00Z"),
        at("2026-10-13T10:00Z"),
        at("2026-10-13T14:00Z"),
        at("2026-10-13T15:00Z"),
      ),
    ).toBe(false);
  });
});

describe("intersectOccurrences", () => {
  it("returns nothing when either side is empty", () => {
    expect(
      intersectOccurrences(
        [],
        [slot("2026-10-13T09:00Z", "2026-10-13T10:00Z")],
      ),
    ).toEqual([]);
    expect(
      intersectOccurrences(
        [slot("2026-10-13T09:00Z", "2026-10-13T10:00Z")],
        [],
      ),
    ).toEqual([]);
  });

  it("matches only the clashing weeks of a recurring candidate", () => {
    const candidates = [
      slot("2026-10-13T09:00Z", "2026-10-13T10:00Z"),
      slot("2026-10-20T09:00Z", "2026-10-20T10:00Z"),
      slot("2026-10-27T09:00Z", "2026-10-27T10:00Z"),
    ];
    const existing = [
      { id: "a", ...slot("2026-10-20T09:30Z", "2026-10-20T10:30Z") },
      { id: "b", ...slot("2026-11-03T09:00Z", "2026-11-03T10:00Z") },
    ];

    const hits = intersectOccurrences(candidates, existing);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.existing.id).toBe("a");
    expect(hits[0]!.candidate.start.toISOString()).toBe(
      "2026-10-20T09:00:00.000Z",
    );
  });

  it("reports every clashing pair when one candidate spans several bookings", () => {
    const candidates = [slot("2026-10-13T09:00Z", "2026-10-13T13:00Z")];
    const existing = [
      { id: "a", ...slot("2026-10-13T09:00Z", "2026-10-13T10:00Z") },
      { id: "b", ...slot("2026-10-13T10:00Z", "2026-10-13T11:00Z") },
      { id: "c", ...slot("2026-10-13T14:00Z", "2026-10-13T15:00Z") },
    ];

    const hits = intersectOccurrences(candidates, existing);
    expect(hits.map((h) => h.existing.id)).toEqual(["a", "b"]);
  });

  it("does not let the sweep pointer skip a later candidate's match", () => {
    // A long existing booking overlaps two separate candidates; advancing the
    // pointer past it after the first would lose the second.
    const candidates = [
      slot("2026-10-13T09:00Z", "2026-10-13T10:00Z"),
      slot("2026-10-13T11:00Z", "2026-10-13T12:00Z"),
    ];
    const existing = [
      { id: "long", ...slot("2026-10-13T08:00Z", "2026-10-13T18:00Z") },
    ];

    const hits = intersectOccurrences(candidates, existing);
    expect(hits).toHaveLength(2);
  });

  it("ignores back-to-back neighbours on both sides", () => {
    const candidates = [slot("2026-10-13T10:00Z", "2026-10-13T11:00Z")];
    const existing = [
      { id: "before", ...slot("2026-10-13T09:00Z", "2026-10-13T10:00Z") },
      { id: "after", ...slot("2026-10-13T11:00Z", "2026-10-13T12:00Z") },
    ];
    expect(intersectOccurrences(candidates, existing)).toEqual([]);
  });
});
