import { describe, expect, it } from "vitest";

import {
  batchName,
  canonicalFacultyKeys,
  facultyKey,
  floorOf,
  intakeYear,
  looksLikeName,
  parseClassText,
  parseCohortLabel,
  parseExportInstant,
  parseRoomHeader,
  tidyName,
} from "./sicsr";

/**
 * Every string in here was copied out of the live SICSR export, typos included.
 * The parser is guessing at hand-typed text, so these are the shapes it has to
 * survive rather than a specification of what it should have been.
 */

const ROOMS = ["203", "207", "301", "303", "304", "305", "307", "404"];

describe("parseCohortLabel", () => {
  it("reads a division", () => {
    expect(parseCohortLabel("I", "BCA (V) - Div. C")).toMatchObject({
      programme: "BCA",
      semester: "V",
      division: "C",
      kind: "DIVISION",
      isEvent: false,
    });
  });

  it("reads major and minor course cohorts", () => {
    expect(parseCohortLabel("K", "BCA (V) - Major Courses").kind).toBe("MAJOR");
    expect(parseCohortLabel("L", "BCA (V) - Minor Courses").kind).toBe("MINOR");
  });

  it("reads a stream as a subject cohort", () => {
    expect(parseCohortLabel("u", "MSc-CA (III) - DS")).toMatchObject({
      programme: "MSc-CA",
      semester: "III",
      stream: "DS",
      kind: "SUBJECT",
    });
    expect(parseCohortLabel("h", "MBA-IT (III) - DA - Elective").kind).toBe(
      "SUBJECT",
    );
  });

  it("treats a whole year sitting together as one division", () => {
    expect(parseCohortLabel("p", "MBA-DT (III)")).toMatchObject({
      programme: "MBA-DT",
      semester: "III",
      division: null,
      kind: "DIVISION",
    });
  });

  it("keeps honours divisions as divisions, noting the stream", () => {
    expect(parseCohortLabel("A", "BCA (VII) - Honours Div. A")).toMatchObject({
      division: "A",
      kind: "DIVISION",
      stream: "Honours",
    });
  });

  it("files the campus buckets as events, not cohorts", () => {
    for (const label of ["EXAM", "BREAK", "Meetups", "Guest Lecture", "Common Batch"]) {
      const cohort = parseCohortLabel("z", label);
      expect(cohort.isEvent).toBe(true);
      expect(cohort.programme).toBeNull();
    }
  });

  it("keeps the two spellings of the same programme together", () => {
    // 'f' is "MSC-CA (III)" and 's' is "MSc-CA (III)" in the live legend.
    expect(parseCohortLabel("f", "MSC-CA (III)").programme).toBe("MSc-CA");
    expect(parseCohortLabel("s", "MSc-CA (III)").programme).toBe("MSc-CA");
  });
});

describe("intakeYear and batchName", () => {
  it("counts the intake back from the semester", () => {
    // Academic year 2026-27: semester I has just arrived, VII is in its fourth.
    expect(intakeYear("I", 2026)).toBe(2026);
    expect(intakeYear("III", 2026)).toBe(2025);
    expect(intakeYear("V", 2026)).toBe(2024);
    expect(intakeYear("VII", 2026)).toBe(2023);
  });

  it("names an intake the way the college says it", () => {
    expect(batchName("BCA", 2024)).toBe("24-28 BCA");
    expect(batchName("BBA-IT", 2023)).toBe("23-27 BBA-IT");
    expect(batchName("MBA-IT", 2026)).toBe("26-28 MBA-IT");
  });
});

describe("parseClassText", () => {
  it("splits the common shape", () => {
    expect(
      parseClassText("BCA Sem V Div A - Research Methodology - Mr. Arun Kumar"),
    ).toMatchObject({
      subject: "Research Methodology",
      faculty: "Mr. Arun Kumar",
    });
  });

  it("copes with no spaces around the separators", () => {
    expect(
      parseClassText("MBA(DT) Sem I-Digital Marketing-Ms.Priyanka Bansal"),
    ).toMatchObject({
      subject: "Digital Marketing",
      faculty: "Ms. Priyanka Bansal",
    });
  });

  it("copes with a teacher who has no honorific", () => {
    expect(
      parseClassText(
        "B.B.A. (IT) V - DIV C Business Taxation and Law - Amruta Belhekar",
      ),
    ).toMatchObject({
      subject: "Business Taxation and Law",
      faculty: "Amruta Belhekar",
    });
  });

  it("keeps a subject that reads like a phrase out of the teacher slot", () => {
    const parsed = parseClassText(
      "B.B.A. (IT) V- DIV - B  -Marketing in Emerging Economies -Satyajit wale",
    );
    expect(parsed.subject).toBe("Marketing in Emerging Economies");
    expect(parsed.faculty).toBe("Satyajit Wale");
  });

  it("drops a trailing room number the Room column already holds", () => {
    const parsed = parseClassText(
      "B.B.A. (IT) V- DIV - B  -Marketing in Emerging Economies -Satyaji wale -307",
      ROOMS,
    );
    expect(parsed.subject).toBe("Marketing in Emerging Economies");
    expect(parsed.faculty).toBe("Satyaji Wale");
  });

  it("notes a reschedule and strips the note", () => {
    const parsed = parseClassText(
      "Reschedule : B.B.A. (IT) V - DIV B- Advanced Financial Management- Mr.Rohan Bhase",
    );
    expect(parsed.rescheduled).toBe(true);
    expect(parsed.subject).toBe("Advanced Financial Management");
    expect(parsed.faculty).toBe("Mr. Rohan Bhase");
  });

  it("picks up a stream marker", () => {
    expect(
      parseClassText(
        "MSc(CA) Sem III-CS- Core-Security Management Practices-Mr. Chaitanya Kulkarni",
      ),
    ).toMatchObject({
      stream: "CS",
      subject: "Security Management Practices",
      faculty: "Mr. Chaitanya Kulkarni",
    });

    expect(
      parseClassText(
        "BCA Sem VII (CC) - Grid Computing and Utility computing - Mr. Saket Patrikar",
      ),
    ).toMatchObject({
      stream: "CC",
      subject: "Grid Computing and Utility computing",
      faculty: "Mr. Saket Patrikar",
    });
  });

  it("takes a bracketed specialisation as the stream, whatever it is", () => {
    // The legend never lists these; they only ever appear in the class line.
    expect(
      parseClassText("BCA Sem V (AIML) - Machine Learning - Group 1 - Dr. Sandeep Gaikwad"),
    ).toMatchObject({
      stream: "AIML",
      subject: "Machine Learning - Group 1",
      faculty: "Dr. Sandeep Gaikwad",
    });

    expect(
      parseClassText("BCA Sem VII (DSc) - Advanced Cyber Security - Mr. Saket Patrikar"),
    ).toMatchObject({ stream: "DSC", subject: "Advanced Cyber Security" });
  });

  it("leaves a bracketed phrase in the subject", () => {
    expect(
      parseClassText("MBA(IT) Sem I -Software Engineering (Agile Practices)-Mrs. Surbhi Pai"),
    ).toMatchObject({
      subject: "Software Engineering (Agile Practices)",
      faculty: "Mrs. Surbhi Pai",
    });
  });

  it("leaves a line that is a sentence exactly as it was typed", () => {
    const notice =
      "Invitation for BCA- Honours / Honours with Research Induction Program Batch 2024-28 Sem - V on 1st July 2026 at 10:00 AM";
    expect(parseClassText(notice)).toMatchObject({
      subject: notice,
      faculty: null,
    });
  });

  it("reads a class two cohorts sit together for", () => {
    expect(
      parseClassText("BCA + BBA(IT) Sem VII - Literature Review - Dr. Parag Kaveri"),
    ).toMatchObject({
      subject: "Literature Review",
      faculty: "Dr. Parag Kaveri",
    });
  });

  it("keeps a bare line whole when there is nothing to split", () => {
    expect(parseClassText("Meeting")).toMatchObject({
      subject: "Meeting",
      faculty: null,
    });
    expect(parseClassText("Exam")).toMatchObject({
      subject: "Exam",
      faculty: null,
    });
  });

  it("never loses the line it was given", () => {
    const raw = "BBA(IT) III- DIV  B Human Resource Management -Dr. Madhu Arora";
    expect(parseClassText(raw).raw).toBe(raw);
  });
});

describe("looksLikeName", () => {
  it("accepts people", () => {
    for (const name of [
      "Mr. Arun Kumar",
      "Dr.Farhana Desai",
      "Amruta Belhekar",
      "Satyajit wale",
    ]) {
      expect(looksLikeName(name)).toBe(true);
    }
  });

  it("rejects subjects", () => {
    for (const subject of [
      "Marketing in Emerging Economies",
      "Research Methodology and Statistics",
      "Introduction to Python Programming",
      "Business Analytics 2",
    ]) {
      expect(looksLikeName(subject)).toBe(false);
    }
  });
});

describe("tidyName and facultyKey", () => {
  it("normalises how the same person is typed", () => {
    expect(tidyName("Mr.Rohan Bhase")).toBe("Mr. Rohan Bhase");
    expect(tidyName("satyajit wale")).toBe("Satyajit Wale");
  });

  it("treats the same person written differently as one record", () => {
    expect(facultyKey("Mr. Arun Kumar")).toBe(facultyKey("arun kumar"));
    expect(facultyKey("Dr.Farhana Desai")).toBe(facultyKey("Farhana  Desai"));
    expect(facultyKey("Mr. Saket Patrikar")).not.toBe(facultyKey("Sagar Bedre"));
  });

  it("ignores a middle name that only sometimes gets typed", () => {
    // Both spellings appear in the live export, taking the same classes.
    expect(facultyKey("Dr. Prafulla Bafna")).toBe(
      facultyKey("Dr. Prafulla Bharat Bafna"),
    );
    expect(facultyKey("Dr. Parag Kaveri")).toBe(
      facultyKey("Dr. Parag Ravikant Kaveri"),
    );
  });

  it("keeps people apart when the surname itself differs", () => {
    // facultyKey alone never guesses; canonicalFacultyKeys does the folding.
    expect(facultyKey("Gauri Josh")).not.toBe(facultyKey("Gauri Joshi"));
  });

  it("drops what gets typed after a name", () => {
    expect(tidyName("Mr. Rohan Bhase Lecture")).toBe("Mr. Rohan Bhase");
    expect(tidyName("Dr. Prafulla Bharat Bafna Written Test")).toBe(
      "Dr. Prafulla Bharat Bafna",
    );
    expect(tidyName("Dr. Shilpa madam")).toBe("Dr. Shilpa");
  });
});

describe("canonicalFacultyKeys", () => {
  const fold = (names: string[]) => {
    const canonical = canonicalFacultyKeys(names.map(facultyKey));
    return (name: string) => canonical.get(facultyKey(name));
  };

  it("folds a name the export cut short into the whole one", () => {
    // The short-description column clips at a fixed width, so both spellings
    // of these teachers appear across the term.
    const of = fold(["Gauri Josh", "Gauri Joshi", "Mr. Chaitanya Kulkarn", "Mr. Chaitanya Kulkarni"]);
    expect(of("Gauri Josh")).toBe(facultyKey("Gauri Joshi"));
    expect(of("Mr. Chaitanya Kulkarn")).toBe(facultyKey("Mr. Chaitanya Kulkarni"));
  });

  it("folds a clipped first name too", () => {
    const of = fold(["Satyaji Wale", "Satyajit Wale"]);
    expect(of("Satyaji Wale")).toBe(facultyKey("Satyajit Wale"));
  });

  it("gives a bare first name to the only teacher who has it", () => {
    const of = fold(["Shilpa", "Dr. Shilpa Sardesai", "Mr. Arun Kumar"]);
    expect(of("Shilpa")).toBe(facultyKey("Dr. Shilpa Sardesai"));
  });

  it("leaves a bare first name alone when two teachers share it", () => {
    const of = fold(["Gauri", "Ms. Gauri Madan", "Gauri Joshi"]);
    expect(of("Gauri")).toBe(facultyKey("Gauri"));
  });

  it("refuses a misspelling, which is not a truncation", () => {
    const of = fold(["Umesh Patwari", "Mr. Umesh Pattwari"]);
    expect(of("Umesh Patwari")).toBe(facultyKey("Umesh Patwari"));
  });

  it("settles a chain on the longest name in it", () => {
    const of = fold(["Shilp", "Shilpa Sard", "Dr. Shilpa Sardesai"]);
    expect(of("Shilp")).toBe(facultyKey("Dr. Shilpa Sardesai"));
    expect(of("Shilpa Sard")).toBe(facultyKey("Dr. Shilpa Sardesai"));
  });

  it("leaves everybody else exactly where they were", () => {
    const of = fold(["Mr. Arun Kumar", "Dr. Farhana Desai"]);
    expect(of("Mr. Arun Kumar")).toBe(facultyKey("Mr. Arun Kumar"));
    expect(of("Dr. Farhana Desai")).toBe(facultyKey("Dr. Farhana Desai"));
  });
});

describe("looksLikeName", () => {
  it("refuses what gets typed where a teacher should be", () => {
    for (const filler of ["Full Day", "Reshedule", "Test", "Extra", "booked", "SICSR"]) {
      expect(looksLikeName(filler)).toBe(false);
    }
  });

  it("still reads a name that was credited rather than named", () => {
    expect(looksLikeName("By Anagha Gosavi")).toBe(true);
    expect(tidyName("By Anagha Gosavi")).toBe("Anagha Gosavi");
  });
});

describe("rooms", () => {
  it("reads the capacity out of a grid header", () => {
    expect(parseRoomHeader("203 (24)")).toEqual({ name: "203", capacity: 24 });
    expect(parseRoomHeader("SDRC (15)")).toEqual({ name: "SDRC", capacity: 15 });
    expect(parseRoomHeader("Terrace")).toEqual({ name: "Terrace", capacity: null });
  });

  it("reads the floor off the room number", () => {
    expect(floorOf("203")).toBe(2);
    expect(floorOf("707")).toBe(7);
    expect(floorOf("Terrace")).toBe(0);
  });
});

describe("parseExportInstant", () => {
  it("reads the export's date format", () => {
    expect(parseExportInstant("08:00:00 - Wednesday 22 July 2026")).toEqual({
      year: 2026,
      month: 7,
      day: 22,
      hour: 8,
      minute: 0,
    });
    expect(parseExportInstant("17:30:00 - Monday 10 August 2026")).toMatchObject({
      hour: 17,
      minute: 30,
    });
  });

  it("refuses what it cannot read rather than guessing", () => {
    expect(parseExportInstant("")).toBeNull();
    expect(parseExportInstant("not a time - Monday 10 August 2026")).toBeNull();
    expect(parseExportInstant("08:00:00")).toBeNull();
  });
});
