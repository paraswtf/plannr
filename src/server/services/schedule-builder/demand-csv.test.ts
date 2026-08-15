import { describe, expect, it } from "vitest";

import {
  matchDemandColumn,
  parseDuration,
  resolveDemand,
  splitCell,
  type DemandColumn,
  type DemandLookup,
  type ResolveDemandInput,
} from "./demand-csv";

const lookup: DemandLookup = {
  groups: [
    { id: "g-a", name: "BCA-A", label: "BCA-A · Sem III" },
    { id: "g-b", name: "BCA-B", label: null },
  ],
  faculty: [
    { id: "f-rao", name: "Dr. K. Rao", shortName: "Dr. Rao", email: "k.rao@college.edu" },
    { id: "f-sen", name: "Anita Sen", shortName: null, email: "anita.sen@college.edu" },
  ],
  rooms: [
    { id: "r-101", code: "A-101" },
    { id: "r-lab", code: "LAB-1" },
  ],
};

const resolve = (
  records: Array<{ line: number; values: Partial<Record<DemandColumn, string>> }>,
  over: Partial<ResolveDemandInput> = {},
) =>
  resolveDemand({
    records,
    lookup,
    slotMinutes: 30,
    workingDayMinutes: 8 * 60,
    ...over,
  });

describe("matchDemandColumn", () => {
  it("recognises the obvious headers", () => {
    expect(matchDemandColumn("Group")).toBe("group");
    expect(matchDemandColumn("Subject")).toBe("subject");
    expect(matchDemandColumn("Sessions")).toBe("sessions");
  });

  it("recognises how departments actually label them", () => {
    expect(matchDemandColumn("Lectures per week")).toBe("sessions");
    expect(matchDemandColumn("Taught by")).toBe("faculty");
    expect(matchDemandColumn("Division")).toBe("group");
    expect(matchDemandColumn("room_type")).toBe("roomType");
    expect(matchDemandColumn("  Preferred Room  ")).toBe("room");
  });

  it("returns null for a column we do not use", () => {
    expect(matchDemandColumn("Semester GPA")).toBeNull();
  });
});

describe("splitCell", () => {
  it("splits on the separators a person might reach for", () => {
    expect(splitCell("Dr. Rao | Dr. Sen")).toEqual(["Dr. Rao", "Dr. Sen"]);
    expect(splitCell("projector, computers")).toEqual(["projector", "computers"]);
    expect(splitCell("")).toEqual([]);
    expect(splitCell(undefined)).toEqual([]);
  });
});

describe("parseDuration", () => {
  it("reads the shapes a duration is written in", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("90m")).toBe(90);
    expect(parseDuration("90 mins")).toBe(90);
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("2 hours")).toBe(120);
  });

  it("reads a small bare number as hours and a large one as minutes", () => {
    expect(parseDuration("2")).toBe(120);
    expect(parseDuration("120")).toBe(120);
  });

  it("rejects what is not a duration", () => {
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
});

describe("resolveDemand", () => {
  it("resolves a straightforward line", () => {
    const result = resolve([
      {
        line: 2,
        values: {
          group: "BCA-A",
          subject: "Data Structures",
          sessions: "3",
          duration: "60",
          faculty: "Dr. Rao",
          features: "projector",
        },
      },
    ]);

    expect(result.summary).toEqual({ ready: 1, error: 0, sessions: 3 });
    expect(result.rows[0]!.requirement).toMatchObject({
      groupId: "g-a",
      subject: "Data Structures",
      sessionsPerWeek: 3,
      durationMinutes: 60,
      facultyIds: ["f-rao"],
      requiredFeatures: ["PROJECTOR"],
      sourceLine: 2,
    });
  });

  it("matches a group by its display label as well as its name", () => {
    const result = resolve([
      { line: 2, values: { group: "BCA-A · Sem III", subject: "Maths" } },
    ]);
    expect(result.rows[0]!.requirement?.groupId).toBe("g-a");
  });

  it("matches faculty by short name, full name, email or its local part", () => {
    const rows = resolve([
      { line: 2, values: { group: "BCA-A", subject: "x", faculty: "Dr. Rao" } },
      { line: 3, values: { group: "BCA-A", subject: "x", faculty: "K Rao" } },
      { line: 4, values: { group: "BCA-A", subject: "x", faculty: "k.rao@college.edu" } },
      { line: 5, values: { group: "BCA-A", subject: "x", faculty: "anita.sen" } },
    ]).rows;

    expect(rows.map((r) => r.requirement?.facultyIds)).toEqual([
      ["f-rao"],
      ["f-rao"],
      ["f-rao"],
      ["f-sen"],
    ]);
  });

  it("takes several teachers for one session", () => {
    const result = resolve([
      {
        line: 2,
        values: { group: "BCA-A", subject: "Lab", faculty: "Dr. Rao | Anita Sen" },
      },
    ]);
    expect(result.rows[0]!.requirement?.facultyIds).toEqual(["f-rao", "f-sen"]);
  });

  it("does not list the same teacher twice", () => {
    const result = resolve([
      {
        line: 2,
        values: { group: "BCA-A", subject: "Lab", faculty: "Dr. Rao, k.rao@college.edu" },
      },
    ]);
    expect(result.rows[0]!.requirement?.facultyIds).toEqual(["f-rao"]);
  });

  it("understands the words people use for room features", () => {
    const result = resolve([
      {
        line: 2,
        values: { group: "BCA-A", subject: "Lab", features: "PCs; smartboard; air conditioning" },
      },
    ]);
    expect(result.rows[0]!.requirement?.requiredFeatures).toEqual([
      "COMPUTERS",
      "SMART_BOARD",
      "AC",
    ]);
  });

  it("understands room types, including loose spellings", () => {
    const result = resolve([
      { line: 2, values: { group: "BCA-A", subject: "x", roomType: "laboratory" } },
      { line: 3, values: { group: "BCA-A", subject: "x", roomType: "Lecture Hall" } },
    ]);
    expect(result.rows.map((r) => r.requirement?.roomType)).toEqual([
      "LAB",
      "LECTURE_HALL",
    ]);
  });

  it("resolves a preferred room by code, punctuation and all", () => {
    const result = resolve([
      { line: 2, values: { group: "BCA-A", subject: "x", room: "a101" } },
    ]);
    expect(result.rows[0]!.requirement?.preferredRoomId).toBe("r-101");
  });

  it("defaults an empty session count to one", () => {
    const result = resolve([{ line: 2, values: { group: "BCA-A", subject: "x" } }]);
    expect(result.rows[0]!.requirement?.sessionsPerWeek).toBe(1);
  });

  it("rounds a duration up onto the slot grid and says so", () => {
    const result = resolve([
      { line: 2, values: { group: "BCA-A", subject: "x", duration: "50" } },
    ]);
    expect(result.rows[0]!.requirement?.durationMinutes).toBe(60);
    expect(result.rows[0]!.warnings[0]).toMatch(/rounded 50 min up to 60 min/);
  });

  it("rejects a session longer than the working day", () => {
    const result = resolve([
      { line: 2, values: { group: "BCA-A", subject: "x", duration: "600" } },
    ]);
    expect(result.rows[0]!.status).toBe("error");
    expect(result.rows[0]!.errors[0]).toMatch(/longer than the working day/i);
  });

  it("names what it could not find, line by line", () => {
    const result = resolve([
      { line: 2, values: { group: "BCA-Z", subject: "x" } },
      { line: 3, values: { group: "BCA-A", subject: "x", faculty: "Dr. Who" } },
      { line: 4, values: { group: "BCA-A", subject: "x", features: "hovercraft" } },
      { line: 5, values: { group: "BCA-A", subject: "x", room: "Z-999" } },
    ]);

    expect(result.summary.error).toBe(4);
    expect(result.rows[0]!.errors[0]).toMatch(/No group called "BCA-Z"/);
    expect(result.rows[1]!.errors[0]).toMatch(/No faculty member called "Dr. Who"/);
    expect(result.rows[2]!.errors[0]).toMatch(/not something a room can have/);
    expect(result.rows[3]!.errors[0]).toMatch(/No room called "Z-999"/);
  });

  it("requires a group and a subject", () => {
    const result = resolve([{ line: 2, values: { sessions: "3" } }]);
    expect(result.rows[0]!.errors).toContain("Group is required");
    expect(result.rows[0]!.errors).toContain("Subject is required");
  });

  it("rejects a session count that is not a number", () => {
    const result = resolve([
      { line: 2, values: { group: "BCA-A", subject: "x", sessions: "loads" } },
    ]);
    expect(result.rows[0]!.status).toBe("error");
  });

  it("keeps good rows alongside bad ones", () => {
    const result = resolve([
      { line: 2, values: { group: "BCA-A", subject: "Good", sessions: "2" } },
      { line: 3, values: { group: "Nope", subject: "Bad" } },
      { line: 4, values: { group: "BCA-B", subject: "Also good", sessions: "3" } },
    ]);

    expect(result.summary).toEqual({ ready: 2, error: 1, sessions: 5 });
  });
});
