import { describe, expect, it } from "vitest";

import {
  BBA_IT_SEM_V,
  BBA_IT_SEM_VII,
  BCA_SEM_VII,
  collegeEmail,
  electiveForTitle,
  electiveFromLabel,
  excelDate,
  fromCsv,
  laterSource,
  normaliseBatch,
  normaliseProgramme,
  readDivision,
  readSourceName,
  ROSTER_COLUMNS,
  rosterRow,
  tidyName,
  toCsv,
  type RosterStudent,
} from "./roster";

/**
 * The strings here are copied out of the documents the college sent, cells and
 * spelling as they arrived.
 */

const student = (over: Partial<RosterStudent> = {}): RosterStudent => ({
  prn: "23030124026",
  name: "Paras Deshpande",
  collegeEmail: "pad2324026@sicsr.ac.in",
  personalEmail: "",
  phone: "",
  dateOfBirth: "",
  bloodGroup: "",
  category: "",
  programme: "BCA",
  batch: "23-27 BCA",
  semester: "VII",
  division: "A",
  track: "Honours",
  status: "Active",
  gender: "",
  majorGroup: 4,
  minorGroup: 6,
  section: "",
  source: "a list",
  inferred: [],
  ...over,
});

describe("readSourceName and laterSource", () => {
  it("reads the date the college sent a file, off its name", () => {
    expect(readSourceName("2026-08-12 - AWC BCA Sem VII 6-8 and 7-8.xlsx")).toEqual({
      date: "2026-08-12",
      name: "AWC BCA Sem VII 6-8 and 7-8.xlsx",
      current: true,
    });
  });

  it("knows which side of the semester a file falls on", () => {
    // The semester began on 1 July 2026: a list from January describes an
    // arrangement that no longer exists.
    expect(readSourceName("2026-01-27 - BCA 23-27 Sem VI Student List.pdf").current).toBe(false);
    expect(readSourceName("2026-07-01 - anything.pdf").current).toBe(true);
    expect(readSourceName("2026-06-30 - anything.pdf").current).toBe(false);
  });

  it("takes an unstamped file as current, it having been put there on purpose", () => {
    expect(readSourceName("BBA(IT) 2023-27 Honours.pdf")).toEqual({
      date: "",
      name: "BBA(IT) 2023-27 Honours.pdf",
      current: true,
    });
  });

  it("believes this semester over last, and a dated file over an unstamped one", () => {
    const august = readSourceName("2026-08-14 - mentor list.csv");
    const july = readSourceName("2026-07-10 - honours list.pdf");
    const january = readSourceName("2026-01-27 - old list.pdf");
    const handed = readSourceName("honours list.pdf");

    expect(laterSource(july, august)).toBe(august);
    expect(laterSource(august, july)).toBe(august);
    expect(laterSource(january, july)).toBe(july);
    expect(laterSource(handed, july)).toBe(july);
    // Nothing from last semester wins, however precisely it is dated.
    expect(laterSource(january, handed)).toBe(handed);
  });
});

describe("normaliseProgramme", () => {
  it("gathers the spellings the college uses for one course", () => {
    for (const spelling of ["BBA(IT)", "BBA-IT", "B.B.A. (IT)", "BBAIT", "bba(it)"]) {
      expect(normaliseProgramme(spelling), spelling).toBe("BBA-IT");
    }
    for (const spelling of ["BCA", "B.C.A.", "BCA Honours with Research"]) {
      expect(normaliseProgramme(spelling), spelling).toBe("BCA");
    }
    expect(normaliseProgramme("MSc(CA)")).toBe("MSc-CA");
  });

  it("says nothing rather than guessing at something it does not know", () => {
    expect(normaliseProgramme("")).toBe("");
    expect(normaliseProgramme("Diploma in Something")).toBe("");
  });
});

describe("the elective schemes", () => {
  it("keeps each year's own numbering, which does not start at one", () => {
    // The BBA-IT Sem V list has no Group 1: the minors on offer are 2, 3 and 4.
    expect(BBA_IT_SEM_V.electives.map((e) => e.group)).toEqual([2, 3, 4]);
    expect(BBA_IT_SEM_VII.electives.map((e) => e.group)).toEqual([1, 2, 3]);
    expect(BCA_SEM_VII.electives.map((e) => e.group)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("marks the year whose electives are taught to two sections", () => {
    expect(BBA_IT_SEM_V.sectioned).toBe(true);
    expect(BBA_IT_SEM_VII.sectioned).toBeUndefined();
  });
});

describe("electiveFromLabel", () => {
  it("reads the elective a list's own cell names", () => {
    expect(
      electiveFromLabel(
        "Group 3 Digital Marketing(Fundamental of Mkt., Service Marketing)",
        BBA_IT_SEM_V,
      )?.name,
    ).toBe("Digital Marketing");
    expect(electiveFromLabel("Group 4 Analytics(Analytics Foundations)", BBA_IT_SEM_V)?.group).toBe(4);
  });

  it("falls back to the name when the cell lost its number", () => {
    // This is what a wrapped cell leaves behind: the first line is the number.
    expect(
      electiveFromLabel("(Network Essentials, IT Infra.Service Management)", BBA_IT_SEM_V),
    ).toBeUndefined();
    expect(electiveFromLabel("IT Infrastructure Management", BBA_IT_SEM_V)?.group).toBe(2);
  });
});

describe("electiveForTitle", () => {
  it("places every BBA-IT Sem VII minor the timetable teaches", () => {
    const of = (title: string) => electiveForTitle(title, BBA_IT_SEM_VII)?.name;
    expect(of("H - Software Quality Management Standards")).toBe("Software Solutions Management");
    expect(of("H - Introduction To Cloud Computing")).toBe("IT Infrastructure Management");
    expect(of("H - E - Customer Relationship Management")).toBe("Digital Marketing");
  });

  it("leaves that year's ordinary classes alone", () => {
    for (const other of [
      "Cryptography",
      "Corporate Governance Ethics",
      "E Supply Chain Management",
      "Introduction To Entrepreneurship",
    ]) {
      expect(electiveForTitle(other, BBA_IT_SEM_VII), other).toBeNull();
    }
  });

  it("is asked only about the year whose scheme it is given", () => {
    // "IT Infrastructure Management" is a minor in both years, and Sem V has a
    // paper by almost that name; the scheme decides which is meant.
    expect(electiveForTitle("IT Infrastructure & Service Management", BBA_IT_SEM_V)?.group).toBe(2);
    expect(electiveForTitle("Deep Learning", BBA_IT_SEM_VII)).toBeNull();
  });
});

describe("collegeEmail", () => {
  it("takes the college address out of a cell holding two", () => {
    expect(collegeEmail("dalip_madhav.suri1961@hotmail.com;mas2325094@sicsr.ac.in")).toBe(
      "mas2325094@sicsr.ac.in",
    );
    expect(collegeEmail("gmail.com,ric2425114@sicsr.ac.in")).toBe("ric2425114@sicsr.ac.in");
  });

  it("returns nothing rather than a personal address", () => {
    expect(collegeEmail("utkarshsingh1512@gmail.com")).toBe("");
    expect(collegeEmail("")).toBe("");
  });

  it("lowercases what it finds, since the register shouts sometimes", () => {
    expect(collegeEmail("SHT2325078@SICSR.AC.IN")).toBe("sht2325078@sicsr.ac.in");
  });
});

describe("readDivision", () => {
  it("reads a division letter", () => {
    expect(readDivision("A")).toEqual({ division: "A", track: "" });
    expect(readDivision(" c ")).toEqual({ division: "C", track: "" });
  });

  it("reads a track written where a division should be", () => {
    expect(readDivision("Honours with Research")).toEqual({
      division: "",
      track: "Honours with Research",
    });
  });

  it("gives nothing for a year that states no division", () => {
    expect(readDivision("")).toEqual({ division: "", track: "" });
  });

  it('reads "HR", which is how one wellness list writes the research track', () => {
    expect(readDivision("HR")).toEqual({ division: "", track: "Honours with Research" });
  });
});

describe("normaliseBatch and excelDate", () => {
  it("writes an intake the way the app names it, however it was typed", () => {
    expect(normaliseBatch("2023-27", "BBA-IT")).toBe("23-27 BBA-IT");
    expect(normaliseBatch("2024-2028", "BBA-IT")).toBe("24-28 BBA-IT");
  });

  it("reads the date behind a spreadsheet's serial", () => {
    expect(excelDate("39254")).toBe("2007-06-21");
    expect(excelDate("")).toBe("");
    expect(excelDate("not a date")).toBe("");
  });
});

describe("tidyName", () => {
  it("softens the register's capitals but leaves a written name alone", () => {
    expect(tidyName("THAKUR SAVANI DIPESH")).toBe("Thakur Savani Dipesh");
    expect(tidyName("Aarambha  Gurung")).toBe("Aarambha Gurung");
  });
});

describe("the consolidated file", () => {
  it("writes the subjects of the electives a student chose", () => {
    const row = rosterRow(student());
    const column = (name: (typeof ROSTER_COLUMNS)[number]) => row[ROSTER_COLUMNS.indexOf(name)];
    expect(column("major_elective")).toBe("Data Security");
    expect(column("major_subjects")).toBe(
      "Advanced Cyber Security; Security Management Practices",
    );
    expect(column("minor_elective")).toBe("System Administration");
  });

  it("leaves the elective columns empty when nothing was chosen", () => {
    const row = rosterRow(student({ majorGroup: 0, minorGroup: 0 }));
    expect(row[ROSTER_COLUMNS.indexOf("major_elective")]).toBe("");
    expect(row[ROSTER_COLUMNS.indexOf("minor_subjects")]).toBe("");
  });

  it("survives a round trip, commas and all", () => {
    const awkward = student({
      name: "Someone, With a Comma",
      inferred: ["electives continued from Sem V (3 and 5)", 'and a "quote"'],
    });
    const parsed = fromCsv(toCsv([awkward]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.name).toBe("Someone, With a Comma");
    expect(parsed[0]!.inferred).toBe(
      'electives continued from Sem V (3 and 5); and a "quote"',
    );
    expect(parsed[0]!.college_email).toBe("pad2324026@sicsr.ac.in");
  });

  it("is ordered by PRN, which groups each intake and reads against any list", () => {
    const csv = toCsv([
      student({ prn: "26030125001", semester: "I", batch: "26-30 BBA-IT", programme: "BBA-IT" }),
      student({ prn: "23030125004", semester: "VII", batch: "23-27 BBA-IT", programme: "BBA-IT" }),
      student({ prn: "23030124026" }),
      student({ prn: "24030124001", semester: "V", batch: "24-28 BCA" }),
    ]);
    expect(fromCsv(csv).map((r) => r.prn)).toEqual([
      "23030124026",
      "23030125004",
      "24030124001",
      "26030125001",
    ]);
  });
});
