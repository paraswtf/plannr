/**
 * The consolidated student roster: one row per student, whatever it came from.
 *
 * The college sends a different document per batch, per programme and per
 * purpose — a printed honours list here, a spreadsheet of the whole year there,
 * an elective list in a third shape — and each names the same things
 * differently. This module says what a student *is* once all of that is read,
 * and how that turns into the single CSV everything downstream uses.
 *
 * Two rules run through it. Nothing is invented: a field the documents do not
 * state is left empty rather than guessed, and anything carried over from an
 * older list is recorded in `inferred` so it can be checked. And the college's
 * own vocabulary is kept — divisions are letters, electives are "groups" with
 * the numbers it gives them — so that a row can be read against the paper it
 * came from.
 */

// ─── Where a fact came from, and whether it still holds ─────────────────────

/**
 * The day the current semester began.
 *
 * The college re-divides its years, moves students between divisions and
 * re-runs the elective choice each semester, so a list drawn up before this
 * date describes an arrangement that no longer exists. Names, PRNs and phone
 * numbers do not expire that way and are taken from a document of any age.
 */
export const SEMESTER_START = "2026-07-01";

export interface SourceStamp {
  /** The date the college sent it, from the filename; empty when unstamped. */
  date: string;
  /** The filename with that prefix removed. */
  name: string;
  /** Whether it may be believed about divisions, groups, electives, sections. */
  current: boolean;
}

/**
 * Reads the provenance a harvested filename carries.
 *
 * Files pulled out of the mailbox are named "2026-08-12 - whatever.xlsx", the
 * date being when the college sent it rather than when it was downloaded. A
 * file without that prefix was put in the folder by hand, which is its own kind
 * of provenance — somebody meant it to be used — so it is taken as current, but
 * it loses to a dated post-July source covering the same ground.
 */
export function readSourceName(filename: string): SourceStamp {
  const stamped = /^(\d{4}-\d{2}-\d{2})\s*-\s*(.+)$/.exec(filename);
  if (!stamped) return { date: "", name: filename, current: true };
  return {
    date: stamped[1]!,
    name: stamped[2]!,
    current: stamped[1]! >= SEMESTER_START,
  };
}

/** Which of two sources should be believed about a division. */
export function laterSource(a: SourceStamp, b: SourceStamp): SourceStamp {
  if (a.current !== b.current) return a.current ? a : b;
  // A dated source outranks a hand-placed one: it says when it was true.
  if (!a.date) return b.date ? b : a;
  if (!b.date) return a;
  return a.date >= b.date ? a : b;
}

// ─── Electives ──────────────────────────────────────────────────────────────

export interface ElectiveSubject {
  /** The paper code the college prints, e.g. "703"; empty when it prints none. */
  code: string;
  title: string;
}

export interface Elective {
  /** The number the college gives it, as in "Group 3". */
  group: number;
  name: string;
  /** Whether it is one of the majors or one of the minors of that semester. */
  kind: "MAJOR" | "MINOR";
  subjects: ElectiveSubject[];
}

/** Which programme, intake and semester an elective scheme belongs to. */
export interface ElectiveScheme {
  programme: string;
  semester: string;
  electives: Elective[];
  /**
   * True where an elective is taught twice over, to a Group 1 and a Group 2
   * section. Knowing the elective is then not enough to know which class a
   * student attends, so the classes are left where the timetable put them
   * until the sections themselves are groups.
   */
  sectioned?: boolean;
}

/**
 * BCA 23-27 in Sem VII, from the header of the honours student list.
 *
 * Spelling included: the timetable writes "Advance Anroid Programming" too, so
 * correcting it on one side only would stop the two matching.
 */
export const BCA_SEM_VII: ElectiveScheme = {
  programme: "BCA",
  semester: "VII",
  electives: [
    {
      group: 1,
      name: "Data Science",
      kind: "MAJOR",
      subjects: [
        { code: "703", title: "Python for Data Science" },
        { code: "704", title: "Data Analytics using Ms-Excel" },
      ],
    },
    {
      group: 2,
      name: "Artificial Intelligence and Machine Learning",
      kind: "MAJOR",
      subjects: [
        { code: "705", title: "Natural Language and Responsive AI" },
        { code: "706", title: "Deep Learning" },
      ],
    },
    {
      group: 3,
      name: "Cloud Computing",
      kind: "MAJOR",
      subjects: [
        { code: "707", title: "Grid Computing and Utility computing" },
        { code: "708", title: "Cloud based Solution Architecture" },
      ],
    },
    {
      group: 4,
      name: "Data Security",
      kind: "MAJOR",
      subjects: [
        { code: "709", title: "Advanced Cyber Security" },
        { code: "710", title: "Security Management Practices" },
      ],
    },
    {
      group: 5,
      name: "Software Development",
      kind: "MINOR",
      subjects: [{ code: "711", title: "Advance Anroid Programming" }],
    },
    {
      group: 6,
      name: "System Administration",
      kind: "MINOR",
      subjects: [{ code: "712", title: "Networking Monitoring and Troubleshooting" }],
    },
    {
      group: 7,
      name: "Database Administration",
      kind: "MINOR",
      subjects: [{ code: "713", title: "Database Security and Performance Tuning" }],
    },
  ],
};

/**
 * BBA-IT 24-28 in Sem V, from the elective list.
 *
 * That list names only the minors, because the majors are what the divisions
 * sit for; the subjects in brackets are the ones the timetable teaches, and
 * each minor is taught twice over to a Group 1 and a Group 2 section.
 */
export const BBA_IT_SEM_V: ElectiveScheme = {
  programme: "BBA-IT",
  semester: "V",
  sectioned: true,
  electives: [
    {
      group: 2,
      name: "IT Infrastructure Management",
      kind: "MINOR",
      subjects: [
        { code: "", title: "Network Essentials" },
        { code: "", title: "IT Infrastructure & Service Management" },
      ],
    },
    {
      group: 3,
      name: "Digital Marketing",
      kind: "MINOR",
      subjects: [
        { code: "", title: "Fundamentals of Marketing" },
        { code: "", title: "Services Marketing" },
      ],
    },
    {
      group: 4,
      name: "Analytics",
      kind: "MINOR",
      subjects: [{ code: "", title: "Analytics Foundations" }],
    },
  ],
};

/**
 * BBA-IT 23-27 in Sem VII, from the honours list.
 *
 * The list heads each column with the group and ticks it with the paper's
 * initials — SQMS, ICC, E-CRM — which is also how the timetable writes them,
 * as "H - Software Quality Management Standards" and the rest. A fourth year
 * exists only for honours students: the alternative was to leave after the
 * third, which is why nobody in this year is without a track.
 */
export const BBA_IT_SEM_VII: ElectiveScheme = {
  programme: "BBA-IT",
  semester: "VII",
  electives: [
    {
      group: 1,
      name: "Software Solutions Management",
      kind: "MINOR",
      subjects: [{ code: "SQMS", title: "Software Quality Management Standards" }],
    },
    {
      group: 2,
      name: "IT Infrastructure Management",
      kind: "MINOR",
      subjects: [{ code: "ICC", title: "Introduction To Cloud Computing" }],
    },
    {
      group: 3,
      name: "Digital Marketing",
      kind: "MINOR",
      subjects: [{ code: "E-CRM", title: "Customer Relationship Management" }],
    },
  ],
};

export const SCHEMES: ElectiveScheme[] = [BCA_SEM_VII, BBA_IT_SEM_V, BBA_IT_SEM_VII];

export const schemeFor = (programme: string, semester: string): ElectiveScheme | undefined =>
  SCHEMES.find((s) => s.programme === programme && s.semester === semester);

/** The elective a "Group 3 Digital Marketing(...)" cell is naming. */
export function electiveFromLabel(
  label: string,
  scheme: ElectiveScheme,
): Elective | undefined {
  const number = /group\s*-?\s*(\d)/i.exec(label)?.[1];
  if (number) {
    const byNumber = scheme.electives.find((e) => e.group === Number(number));
    if (byNumber) return byNumber;
  }
  const words = label.toLowerCase();
  return scheme.electives.find((e) => words.includes(e.name.toLowerCase()));
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Edit distance, given up on once it passes `limit` — these are short titles. */
function within(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
      best = Math.min(best, current[j]!);
    }
    if (best > limit) return false;
    previous = current;
  }
  return previous[b.length]! <= limit;
}

/**
 * Which of a scheme's electives a timetabled class teaches, by its title.
 *
 * The timetable writes a class with whatever prefix the office needed — "H - E -
 * Customer Relationship Management" is the honours minor, marked as an elective
 * — so a title counts when it contains a subject of the scheme, or is a couple
 * of keystrokes from one. It is asked only about a cohort whose scheme is known,
 * which is what keeps a name that two years share from being claimed by both.
 */
export function electiveForTitle(title: string, scheme: ElectiveScheme): Elective | null {
  const text = normalise(title);
  if (!text) return null;

  let best: { elective: Elective; score: number } | null = null;
  let tied = false;

  for (const elective of scheme.electives) {
    for (const subject of elective.subjects) {
      const target = normalise(subject.title);
      const score =
        text === target ? 3 : text.includes(target) ? 2 : within(text, target, 2) ? 1 : 0;
      if (score === 0) continue;
      if (!best || score > best.score) {
        best = { elective, score };
        tied = false;
      } else if (score === best.score && best.elective.group !== elective.group) {
        tied = true;
      }
    }
  }
  return best && !tied ? best.elective : null;
}

// ─── A student ──────────────────────────────────────────────────────────────

/** How the college divides a year: by division letter, or by honours track. */
export type Track = "" | "Honours" | "Honours with Research";

export interface RosterStudent {
  prn: string;
  name: string;
  /** The college address — the identity sign-in joins on. Empty when unknown. */
  collegeEmail: string;
  /** Whatever personal address the registry holds, kept apart from the college one. */
  personalEmail: string;
  phone: string;
  /** ISO, from the serial the spreadsheet stores. */
  dateOfBirth: string;
  bloodGroup: string;
  /** The admission category the register records, e.g. "Open", "Defence". */
  category: string;
  programme: string;
  /** As the app names an intake, e.g. "23-27 BCA". */
  batch: string;
  semester: string;
  /** "A", "B", "C" — empty for a year that is not divided, or for a track. */
  division: string;
  track: Track;
  status: "Active" | "Inactive";
  gender: string;
  /** Elective group numbers, as the college numbers them. 0 when unknown. */
  majorGroup: number;
  minorGroup: number;
  /** The section a minor is taught to, e.g. "Group 1". */
  section: string;
  /** Which document this row was read from. */
  source: string;
  /** Anything carried from an older list or worked out, and where from. */
  inferred: string[];
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/**
 * The programme a document names, as this app spells it.
 *
 * The same course is written "BBA(IT)", "BBA-IT", "B.B.A. (IT)" and "BBAIT"
 * across the college's own files, and the backlog sheets append the honours
 * track to it. Left alone, each spelling becomes a cohort of its own.
 */
export function normaliseProgramme(text: string): string {
  const clean = (text ?? "").replace(/[.\s-]/g, "").toLowerCase();
  if (!clean) return "";
  if (/^b?bait|^bba\(?it/.test(clean)) return "BBA-IT";
  if (clean.startsWith("bca")) return "BCA";
  if (/^mba\(?it/.test(clean)) return "MBA-IT";
  if (/^mba\(?dt/.test(clean)) return "MBA-DT";
  if (/^msc\(?ca/.test(clean)) return "MSc-CA";
  return "";
}

/** "2023-27" and "2024-2028" both mean the same intake; the app writes "23-27". */
export function normaliseBatch(batch: string, programme: string): string {
  const years = /(\d{2,4})\s*[-–]\s*(\d{2,4})/.exec(batch);
  if (!years) return batch.trim();
  const short = (year: string) => year.slice(-2);
  return `${short(years[1]!)}-${short(years[2]!)} ${programme}`;
}

/** The intake year a semester implies, counted back from the academic year. */
export function intakeYearOf(semester: string, academicYear: number): number {
  const index = ROMAN.indexOf(semester.toUpperCase());
  return index < 0 ? academicYear : academicYear - Math.floor(index / 2);
}

/**
 * The date behind a spreadsheet's serial number, as plain ISO.
 *
 * Excel counts days from the last day of 1899 and believes 1900 had a 29th of
 * February, which is why the epoch below looks a day out and is not.
 */
export function excelDate(serial: string): string {
  const days = Number(serial);
  if (!Number.isFinite(days) || days <= 0) return "";
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(days) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** ALL-CAPS as a register writes it, softened to how a person is addressed. */
export function tidyName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) =>
      word.length > 1 && word === word.toUpperCase()
        ? word[0] + word.slice(1).toLowerCase()
        : word,
    )
    .join(" ");
}

/**
 * The college address out of a cell that may hold several.
 *
 * The attendance lists put a personal address and the college one in the same
 * cell, separated by whatever the typist reached for, and only the college one
 * is an identity this app can use — it is what Google signs people in with.
 */
export function collegeEmail(cell: string, domain = "sicsr.ac.in"): string {
  for (const part of (cell ?? "").split(/[;,\s]+/)) {
    const candidate = part.trim().toLowerCase();
    if (candidate.endsWith(`@${domain}`)) return candidate;
  }
  return "";
}

/** A division cell that is really naming an honours track rather than a letter. */
export function readDivision(cell: string): { division: string; track: Track } {
  const text = (cell ?? "").replace(/\s+/g, " ").trim();
  // One wellness list writes the research track as "HR" in the division column.
  if (/research/i.test(text) || /^hr$/i.test(text)) {
    return { division: "", track: "Honours with Research" };
  }
  if (/honours/i.test(text)) return { division: "", track: "Honours" };
  return { division: /^[A-Z]$/i.test(text) ? text.toUpperCase() : "", track: "" };
}

// ─── The consolidated file ──────────────────────────────────────────────────

export const ROSTER_COLUMNS = [
  "prn",
  "name",
  "college_email",
  "personal_email",
  "phone",
  "programme",
  "batch",
  "semester",
  "division",
  "track",
  "status",
  "gender",
  "date_of_birth",
  "blood_group",
  "category",
  "major_group",
  "major_elective",
  "major_subjects",
  "minor_group",
  "minor_elective",
  "minor_subjects",
  "section",
  "source",
  "inferred",
] as const;

const escape = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const subjectsOf = (elective: Elective | undefined) =>
  elective ? elective.subjects.map((s) => s.title).join("; ") : "";

/** One student as the consolidated file records them. */
export function rosterRow(student: RosterStudent): string[] {
  const scheme = schemeFor(student.programme, student.semester);
  const major = scheme?.electives.find((e) => e.group === student.majorGroup);
  const minor = scheme?.electives.find((e) => e.group === student.minorGroup);

  return [
    student.prn,
    student.name,
    student.collegeEmail,
    student.personalEmail,
    student.phone,
    student.programme,
    student.batch,
    student.semester,
    student.division,
    student.track,
    student.status,
    student.gender,
    student.dateOfBirth,
    student.bloodGroup,
    student.category,
    student.majorGroup ? String(student.majorGroup) : "",
    major?.name ?? "",
    subjectsOf(major),
    student.minorGroup ? String(student.minorGroup) : "",
    minor?.name ?? "",
    subjectsOf(minor),
    student.section,
    student.source,
    student.inferred.join("; "),
  ];
}

/**
 * The whole roster as one CSV, in PRN order.
 *
 * A PRN is fixed width and begins with the year of admission, so ordering by it
 * groups each intake together and puts the oldest first — and it is the number
 * every college document is itself sorted by, which makes the file easy to read
 * against one of them.
 */
export function toCsv(students: RosterStudent[]): string {
  const ordered = [...students].sort((a, b) => a.prn.localeCompare(b.prn));
  const lines = [ROSTER_COLUMNS.join(",")];
  for (const student of ordered) lines.push(rosterRow(student).map(escape).join(","));
  return lines.join("\n") + "\n";
}

/** Reads the consolidated file back, for whatever wants to import it. */
export function fromCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") value += char;
  }
  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((r) => r.some((cell) => cell.trim()))
    .map((r) => Object.fromEntries(header.map((name, i) => [name, r[i] ?? ""])));
}
