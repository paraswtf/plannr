import { describe, expect, it } from "vitest";

import {
  buildRoster,
  electiveForClass,
  electiveForSubject,
  electiveOf,
  isJointResearchClass,
  SEM_VII_ELECTIVES,
  tidyStudentName,
  type ListRow,
} from "./student-lists";

/**
 * The rows here are copied out of the three real lists, so they carry the same
 * gaps: a research student with no electives, an honours student with an empty
 * division cell, and the double spaces the college types into names.
 */

const semV: ListRow[] = [
  { prn: "23030124003", name: "MAYANK MOULLI SINGH", email: "mas2324003@sicsr.ac.in", division: "A", groups: [2, 5] },
  { prn: "23030124026", name: "PARAS DESHPANDE", email: "pad2324026@sicsr.ac.in", division: "A", groups: [4, 6] },
  { prn: "23030124089", name: "SHWETA", email: "shs2324089@sicsr.ac.in", division: "C", groups: [3, 5] },
  { prn: "23030124007", name: "FARHAN KHAN", email: "fak2324007@sicsr.ac.in", division: "A", groups: [3, 5] },
  { prn: "23030124229", name: "BARDAN BIKRAM  SHAH", email: "bas2324229@sicsr.ac.in", division: "F", groups: [2, 7] },
  { prn: "23030124111", name: "CHANCHAL SAH", email: "chs2324111@sicsr.ac.in", division: "D", groups: [3, 5] },
  { prn: "23030124999", name: "NOT AN HONOURS STUDENT", email: "nah2324999@sicsr.ac.in", division: "E", groups: [1, 7] },
];

describe("SEM_VII_ELECTIVES", () => {
  it("has four majors and three minors, as the list is laid out", () => {
    expect(SEM_VII_ELECTIVES.filter((e) => e.kind === "MAJOR").map((e) => e.group)).toEqual([1, 2, 3, 4]);
    expect(SEM_VII_ELECTIVES.filter((e) => e.kind === "MINOR").map((e) => e.group)).toEqual([5, 6, 7]);
  });

  it("keeps the college's spelling, so the timetable matches", () => {
    // The timetable writes "Advance Anroid Programming" too; correcting one
    // side only would stop the subject and the elective lining up.
    expect(electiveOf(5)!.subjects[0]!.title).toBe("Advance Anroid Programming");
    expect(electiveOf(4)!.subjects.map((s) => s.code)).toEqual(["709", "710"]);
  });
});

describe("electiveForSubject", () => {
  /** Every distinct title the imported Sem VII timetable actually carries. */
  const TIMETABLED: Array<[string, number]> = [
    ["Python for Data Science", 1],
    ["Data Analytics using Ms - Excel", 1],
    ["Extra Lecture : BCA Sem VII : BCA Sem VII (DS) - Data Analytics using Ms - Excel", 1],
    ["Natural Language and Responsive AI", 2],
    ["Deep Learning", 2],
    ["Extra Lecture : BCA Sem VII (AIML) - Deep Learning", 2],
    ["Grid Computing and Utility computing", 3],
    ["Cloud based Solution Architecture", 3],
    ["Advanced Cyber Security", 4],
    ["Security Management Practices", 4],
    ["Advance Android Programming", 5],
    ["Networking Monitoring and Troubleshooting", 6],
    ["Database Security and Performance Tuning", 7],
  ];

  it("places every class the Sem VII timetable holds", () => {
    for (const [title, group] of TIMETABLED) {
      expect(electiveForSubject(title)?.group, title).toBe(group);
    }
  });

  it("forgives the spelling drifting between the two documents", () => {
    // The list says "Anroid", the timetable says "Android".
    expect(electiveForSubject("Advance Android Programming")?.group).toBe(5);
    expect(electiveForSubject("Data Analytics using Ms-Excel")?.group).toBe(1);
  });

  it("refuses a class that belongs to no elective", () => {
    for (const other of [
      "Design Thinking and Problem solving",
      "Web UI and Content Management",
      "Research Methodology",
      "",
    ]) {
      expect(electiveForSubject(other), other).toBeNull();
    }
  });

  it("does not confuse the two security subjects, which sit in different groups", () => {
    // 709 Advanced Cyber Security is a major; 713 Database Security and
    // Performance Tuning is a minor. Both are "security".
    expect(electiveForSubject("Advanced Cyber Security")?.group).toBe(4);
    expect(electiveForSubject("Database Security and Performance Tuning")?.group).toBe(7);
  });
});

describe("electiveForClass", () => {
  /** Raw timetable lines, copied out of the imported events. */
  it("takes the stream code the timetable declares", () => {
    expect(
      electiveForClass({
        title: "Advanced Cyber Security",
        notes: "BCA Sem VII (DSc) - Advanced Cyber Security - Mr. Saket Patrikar",
      }).elective?.group,
    ).toBe(4);

    expect(
      electiveForClass({
        title: "Advance Android Programming",
        notes: "BCA Sem VII (SD) - Advance Android Programming - Dr. Aniket Nagane",
      }).elective?.group,
    ).toBe(5);
  });

  it("still places a class whose line carries no stream code", () => {
    expect(electiveForClass({ title: "Deep Learning", notes: "Deep Learning" }).elective?.group).toBe(2);
  });

  it("is not fooled by a room number that looks like a stream", () => {
    expect(
      electiveForClass({
        title: "Python for Data Science",
        notes: "BCA Sem VII (DS) - Python for Data Science - Dr. Shraddha Vaidya - 705",
      }).elective?.group,
    ).toBe(1);
  });

  it("refuses a class whose two sources disagree", () => {
    const clash = electiveForClass({
      title: "Advance Android Programming",
      notes: "BCA Sem VII (SA) - Advance Android Programming",
    });
    expect(clash.elective).toBeNull();
    expect(clash.disagreed).toBe(true);
  });

  it("refuses another cohort that happens to use the same letters", () => {
    // "DS" is this year's Data Science and also the M.Sc's own stream; "DA" is
    // Database Administration here and Data Analytics in the MBA.
    for (const other of [
      { title: "ANN & Deep Learning", notes: "MSc(CA) Sem III-DS- Elective-ANN & Deep Learning-Mr. Saket Patrikar" },
      { title: "Business Intelligence II", notes: "MBA(IT) Sem III-(DA)-Business Intelligence II-Ms. Prajakta Soman" },
      { title: "Applied Data Analytics with Python", notes: "MBA(IT) Sem III-(DA)-Applied Data Analytics with Python-Ms.Poonam Pawar" },
    ]) {
      expect(electiveForClass(other).elective, other.title).toBeNull();
    }
  });

  it("refuses the same stream a year earlier, which is a different cohort", () => {
    // BCA Sem V splits into the same seven letters with different subjects.
    expect(
      electiveForClass({
        title: "Introduction to Vulnerability Assessment Penetration Testing",
        notes: "BCA Sem V (DSc) - Introduction to Vulnerability Assessment Penetration Testing - Mr. Nandkumar Khachane",
      }).elective,
    ).toBeNull();

    expect(
      electiveForClass({
        title: "Machine Learning - Group 1",
        notes: "BCA Sem V (AIML) - Machine Learning - Group 1 - Dr. Sandeep Gaikwad",
      }).elective,
    ).toBeNull();
  });

  it("leaves a division class where it is", () => {
    expect(
      electiveForClass({
        title: "Web UI and Content Management",
        notes: "BCA Sem VII - Honours Div. A - Web UI and Content Management - Mr. Shashank Gaikwad",
      }).elective,
    ).toBeNull();
  });
});

describe("isJointResearchClass", () => {
  it("recognises the research coursework the two programmes share", () => {
    // All five sit on "Common Batch" in the timetable, where nobody sees them.
    for (const line of [
      "BCA + BBA(IT) Sem VII - Ethich in Research - Dr. Shilpa Mujumdar",
      "BCA + BBA(IT) Sem VII - R Programming - Dr. Prafulla Bafna",
      "BCA + BBA(IT) Sem VII - Literature Review - Dr. Parag Kaveri",
      "BCA + BBA(IT) Sem VII - Scientific Paper Writing - Dr. Shilpa Mujumdar",
      "Lecture schedule : BCA + BBA(IT) Sem VII Honours with Research : LR - Dr. Parag Kaveri Sir",
    ]) {
      expect(isJointResearchClass(line), line).toBe(true);
    }
  });

  it("leaves the rest of the campus-wide bucket alone", () => {
    for (const line of [
      "CHEPand HEI for Semester III for all PG",
      "Friendship Day Quiz Competition",
      "BCA Sem I 2026-30 Self Discovery Assessment - Sew",
      "Photo ID- By Anagha Gosavi",
      "B.B.A. (IT) V- IT Infrastructure & Service Management - Sayali Bedre",
      "emerging career paths beyond coding",
      // One programme alone is that programme's own class, not a shared one.
      "B.B.A (IT) - VII - H with R-Scientific Paper Writing- Dr. Shilpa Mujumdar",
      "BCA Sem VII (AIML) - Deep Learning - Mr. Gaurav Pant",
    ]) {
      expect(isJointResearchClass(line), line).toBe(false);
    }
  });
});

describe("tidyStudentName", () => {
  it("softens the register's capitals", () => {
    expect(tidyStudentName("MAYANK MOULLI SINGH")).toBe("Mayank Moulli Singh");
    expect(tidyStudentName("BARDAN BIKRAM  SHAH")).toBe("Bardan Bikram Shah");
  });

  it("leaves a single letter alone", () => {
    expect(tidyStudentName("KAUSHIKI S TRIPATHI")).toBe("Kaushiki S Tripathi");
  });
});

describe("buildRoster", () => {
  const honours: ListRow[] = [
    { prn: "23030124003", name: "MAYANK MOULLI SINGH", email: "mas2324003@sicsr.ac.in", division: "A", groups: [2, 5] },
    { prn: "23030124026", name: "PARAS DESHPANDE", email: "pad2324026@sicsr.ac.in", division: "A", groups: [4, 6] },
    { prn: "23030124089", name: "SHWETA", email: "shs2324089@sicsr.ac.in", division: "", groups: [3, 5] },
    { prn: "23030124111", name: "CHANCHAL SAH", email: "chs2324111@sicsr.ac.in", division: "B", groups: [1, 5] },
  ];
  const research: ListRow[] = [
    { prn: "23030124007", name: "FARHAN KHAN", email: "fak2324007@sicsr.ac.in", groups: [] },
    { prn: "23030124229", name: "BARDAN BIKRAM  SHAH", email: "bas2324229@sicsr.ac.in", groups: [] },
  ];

  const roster = buildRoster({ honours, research, semV });
  const find = (prn: string) => roster.students.find((s) => s.prn === prn)!;

  it("takes only the honours students, not the rest of the batch", () => {
    expect(roster.students).toHaveLength(6);
    expect(roster.students.map((s) => s.prn)).not.toContain("23030124999");
    expect(roster.rejected).toEqual([]);
  });

  it("splits the two ticks into the major and the minor", () => {
    expect(find("23030124026")).toMatchObject({ major: 4, minor: 6, track: "HONOURS" });
  });

  it("continues a research student's subjects from Sem V", () => {
    expect(find("23030124007")).toMatchObject({
      track: "HONOURS_WITH_RESEARCH",
      major: 3,
      minor: 5,
      division: null,
    });
    expect(find("23030124007").inferred).toEqual(["electives continued from Sem V (3 and 5)"]);
  });

  it("never invents a division for a research student", () => {
    // Their Sem V divisions were D and F, which no longer exist in Sem VII.
    expect(find("23030124229").division).toBeNull();
  });

  it("fills an empty division cell from last year and says so", () => {
    expect(find("23030124089").division).toBe("C");
    expect(find("23030124089").inferred).toEqual(["division C continued from Sem V"]);
  });

  it("notes who changed their elective since Sem V without overriding them", () => {
    expect(roster.changedSince).toEqual([
      { prn: "23030124111", name: "CHANCHAL SAH", from: [3, 5], to: [1, 5] },
    ]);
    expect(find("23030124111").major).toBe(1);
  });

  it("normalises the name and the address", () => {
    expect(find("23030124229")).toMatchObject({
      name: "Bardan Bikram Shah",
      email: "bas2324229@sicsr.ac.in",
    });
  });

  it("refuses a student it cannot place rather than guessing", () => {
    const odd = buildRoster({
      honours: [{ prn: "23030124500", name: "TWO MAJORS", email: "x@y.z", division: "A", groups: [1, 2] }],
      research: [{ prn: "23030124501", name: "UNKNOWN", email: "u@y.z", groups: [] }],
      semV: [],
    });
    expect(odd.students).toEqual([]);
    expect(odd.rejected).toEqual([
      { prn: "23030124500", name: "TWO MAJORS", reason: "expected one major (1-4) and one minor (5-7), got [1, 2]" },
      { prn: "23030124501", name: "UNKNOWN", reason: "no electives on this list and not in the Sem V list either" },
    ]);
  });

  it("refuses a student listed on both lists", () => {
    const dup = buildRoster({
      honours: [{ prn: "23030124003", name: "MAYANK MOULLI SINGH", email: "mas2324003@sicsr.ac.in", division: "A", groups: [2, 5] }],
      research: [{ prn: "23030124003", name: "MAYANK MOULLI SINGH", email: "mas2324003@sicsr.ac.in", groups: [] }],
      semV,
    });
    expect(dup.students).toHaveLength(1);
    expect(dup.rejected[0]).toMatchObject({ prn: "23030124003", reason: "listed twice" });
  });
});
