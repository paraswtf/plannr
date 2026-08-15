/**
 * Builds `data/students.csv` from every document the college has sent.
 *
 * Drop new files anywhere under `data/` and run `npm run roster`. Each file is
 * matched to the reader that suits its shape, every reader contributes stamped
 * observations rather than finished records, and the roster is settled at the
 * end — see `observations.ts` for how a fact earns its place.
 *
 * The rule that matters: a filename beginning "YYYY-MM-DD - " carries the date
 * the college sent it, and only a document from this semester may say where a
 * student sits. Names, addresses and phone numbers are taken from a document of
 * any age. A file with no date was put there by hand, and is taken as current
 * unless a dated source from this semester covers the same ground.
 *
 * It is a generated file — edit the documents or this script, never the CSV.
 * And it invents nothing: a student whose address no document states gets an
 * empty column, because a guessed address is a person who cannot sign in.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readDocxTables, readPdfTable, readWorkbook, type Columns } from "./documents";
import { Ledger } from "./observations";
import {
  BBA_IT_SEM_V,
  collegeEmail,
  electiveFromLabel,
  excelDate,
  readDivision,
  normaliseProgramme,
  readSourceName,
  tidyName,
  toCsv,
  type RosterStudent,
  type SourceStamp,
  type Track,
} from "../src/lib/roster";

const DATA = path.join(process.cwd(), "data");
const OUTPUT = path.join(DATA, "students.csv");
const PRN = /^\d{11}$/;

/** How long each programme runs, for naming an intake "24-28 BCA". */
const PROGRAMME_YEARS: Record<string, number> = {
  BCA: 4,
  "BBA-IT": 4,
  "MBA-IT": 2,
  "MBA-DT": 2,
  "MSc-CA": 2,
};

/**
 * The intake a PRN belongs to.
 *
 * Taken from the PRN rather than from the batch column, which is typed by hand
 * and sometimes wrong — the August wellness list files the 2024-28 year as
 * "2024-29". The first two digits of a PRN are the year of admission and are
 * not open to interpretation.
 */
function batchOf(prn: string, programme: string): string {
  const intake = Number(prn.slice(0, 2));
  const years = PROGRAMME_YEARS[programme] ?? 4;
  return `${String(intake).padStart(2, "0")}-${String((intake + years) % 100).padStart(2, "0")} ${programme}`;
}

// ─── Finding the documents ──────────────────────────────────────────────────

interface Document {
  path: string;
  stamp: SourceStamp;
}

function scan(dir: string): Document[] {
  const found: Document[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...scan(full));
      continue;
    }
    if (entry.startsWith(".") || entry === path.basename(OUTPUT)) continue;
    found.push({ path: full, stamp: readSourceName(entry) });
  }
  return found;
}

// ─── The wellness-check rosters, which cover most cohorts ───────────────────

/** The header row of a sheet is the one that names the PRN column. */
function headerOf(rows: string[][]): { at: number; columns: string[] } {
  const at = rows.findIndex((row) => row.some((cell) => /^PRN/i.test(cell.trim())));
  return { at, columns: at < 0 ? [] : rows[at]! };
}

const findColumn = (columns: string[], ...patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const index = columns.findIndex((c) => pattern.test(c));
    if (index >= 0) return index;
  }
  return -1;
};

const personalEmailIn = (cell: string) => {
  for (const part of (cell ?? "").split(/[;,\s]+/)) {
    const candidate = part.trim().toLowerCase();
    if (candidate.includes("@") && !candidate.endsWith("@sicsr.ac.in")) return candidate;
  }
  return "";
};

/**
 * A spreadsheet with one student per row.
 *
 * The college's wellness-check schedules, the year lists and the contact lists
 * are all this shape, give or take a column, so one reader serves them all.
 * `enrols` says whether being on it means being on this semester's roll — a
 * roster says yes, an exemption list only says the college has your number.
 */
function readStudentSheet(file: Buffer, stamp: SourceStamp, ledger: Ledger, enrols: boolean) {
  for (const sheet of readWorkbook(file)) {
    const { at, columns } = headerOf(sheet.rows);
    if (at < 0) continue;

    // A workbook of year lists usually carries a covering sheet as well — an
    // attendance mail-merge, an exemption list. Those name people without
    // saying they are enrolled; only a sheet named for a cohort does that.
    const namesACohort = /\d{4}\s*-\s*\d{2,4}/.test(sheet.name);
    const enrolsHere = enrols && namesACohort;

    const index = {
      prn: findColumn(columns, /^PRN/i),
      name: findColumn(columns, /Name of the Student/i, /Student'?s? Name/i, /^Student Name/i),
      first: findColumn(columns, /^First Name/i),
      middle: findColumn(columns, /^Middle Name/i),
      last: findColumn(columns, /^Last Name/i),
      gender: findColumn(columns, /^Gender$/i),
      division: findColumn(columns, /^Division$/i, /^Div$/i),
      programme: findColumn(columns, /^Programme$/i),
      semester: findColumn(columns, /^Semester$/i),
      status: findColumn(columns, /^Status$/i),
      college: findColumn(columns, /College Email|Institute Email/i),
      either: findColumn(columns, /^Email Id$/i),
      personal: findColumn(columns, /Student'?s? (Personal )?Email/i),
      phone: findColumn(columns, /Mobile/i),
      dob: findColumn(columns, /^DOB$/i, /Birth Date/i),
      blood: findColumn(columns, /Blood Group/i),
      category: findColumn(columns, /^Category$/i),
    };
    if (index.prn < 0) continue;

    for (const row of sheet.rows.slice(at + 1)) {
      const prn = (row[index.prn] ?? "").trim();
      if (!PRN.test(prn)) continue;

      const name =
        index.name >= 0
          ? (row[index.name] ?? "")
          : [index.first, index.middle, index.last]
              .filter((i) => i >= 0)
              .map((i) => row[i] ?? "")
              .join(" ");

      const mixed = index.either >= 0 ? (row[index.either] ?? "") : "";
      const { division, track } = readDivision(row[index.division] ?? "");
      const programme = normaliseProgramme(row[index.programme] ?? "") || guessProgramme(prn);

      ledger.note(prn, stamp, {
        name: tidyName(name),
        collegeEmail:
          (index.college >= 0 ? collegeEmail(row[index.college] ?? "") : "") || collegeEmail(mixed),
        personalEmail:
          (index.personal >= 0 ? personalEmailIn(row[index.personal] ?? "") : "") ||
          personalEmailIn(mixed),
        phone: index.phone >= 0 ? (row[index.phone] ?? "").trim() : "",
        gender: index.gender >= 0 ? (row[index.gender] ?? "").trim() : "",
        dateOfBirth: index.dob >= 0 ? excelDate(row[index.dob] ?? "") : "",
        bloodGroup: index.blood >= 0 ? (row[index.blood] ?? "").trim() : "",
        category: index.category >= 0 ? (row[index.category] ?? "").trim() : "",
        programme,
        batch: programme ? batchOf(prn, programme) : "",
        semester: (row[index.semester] ?? "").trim(),
        division,
        track,
        status: /inactive/i.test(row[index.status] ?? "") ? "Inactive" : enrolsHere ? "Active" : "",
      });
      if (enrolsHere) ledger.enrol(prn, stamp);
    }
  }
}

/** Which programme a PRN belongs to, by the course digits the college encodes. */
function guessProgramme(prn: string): string {
  const code = prn.slice(6, 8);
  return code === "24" ? "BCA" : code === "25" ? "BBA-IT" : "";
}

// ─── The mentor sheet: the newest word on BCA Sem VII divisions ─────────────

function readMentorCsv(file: Buffer, stamp: SourceStamp, ledger: Ledger) {
  const [header, ...lines] = file.toString("utf8").trim().split(/\r?\n/);
  if (!header) return;
  const columns = header.split(",").map((c) => c.trim().toLowerCase());

  for (const line of lines) {
    const cells = (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [])
      .map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim())
      .slice(0, columns.length);
    const cell = (name: string) => cells[columns.indexOf(name)] ?? "";

    const prn = cell("prn");
    if (!PRN.test(prn)) continue;
    const stated = cell("programme");
    const programme = normaliseProgramme(stated) || guessProgramme(prn);
    // The sheet leaves the division cell empty for the research students and
    // says which they are in the programme column instead.
    const { division, track } = /research/i.test(stated)
      ? { division: "", track: "Honours with Research" as const }
      : readDivision(cell("division"));

    ledger.note(prn, stamp, {
      name: tidyName(cell("name")),
      collegeEmail: collegeEmail(cell("college_email") || cell("email")),
      phone: cell("mobile") || cell("phone"),
      programme,
      batch: programme ? batchOf(prn, programme) : "",
      semester: cell("semester"),
      division,
      track,
      status: "Active",
    });
    ledger.enrol(prn, stamp);
  }
}

// ─── The BCA honours lists, which carry the electives ───────────────────────

const BCA_HONOURS_COLUMNS: Columns = [
  ["sr", 0, 34],
  ["prn", 34, 60],
  ["name", 60, 170],
  ["division", 170, 190],
  ["email", 190, 260],
  ["track", 260, 380],
  ["g1", 380, 440],
  ["g2", 440, 505],
  ["g3", 505, 565],
  ["g4", 565, 615],
  ["g5", 615, 665],
  ["g6", 665, 715],
  ["g7", 715, 800],
];

/** The research list is narrower and has no division or elective columns. */
const BCA_RESEARCH_COLUMNS: Columns = [
  ["sr", 0, 38],
  ["prn", 38, 80],
  ["name", 80, 200],
  ["email", 200, 290],
  ["track", 290, 800],
];

function readBcaHonours(file: Buffer, stamp: SourceStamp, ledger: Ledger, track: Track) {
  const columns = track === "Honours" ? BCA_HONOURS_COLUMNS : BCA_RESEARCH_COLUMNS;
  for (const row of readPdfTable(file, columns)) {
    const groups = [1, 2, 3, 4, 5, 6, 7].filter((n) => (row[`g${n}`] ?? "").trim());
    ledger.note(row.prn!, stamp, {
      name: tidyName(row.name ?? ""),
      collegeEmail: collegeEmail(row.email ?? ""),
      programme: "BCA",
      batch: batchOf(row.prn!, "BCA"),
      semester: "VII",
      division: track === "Honours" ? (row.division ?? "").trim() : "",
      track,
      status: "Active",
      majorGroup: String(groups.find((g) => g <= 4) ?? ""),
      minorGroup: String(groups.find((g) => g >= 5) ?? ""),
    });
    ledger.enrol(row.prn!, stamp);
  }
}

/**
 * The dissertation and project lists of August, which are the newest rosters.
 *
 * They are the same cohort under a different heading: every honours student
 * with the title of the dissertation they are writing, and the research
 * students with their project. Where the July lists carry the elective ticks,
 * these carry a mobile number for everybody, which no other document does.
 */
const BCA_DISSERTATION_COLUMNS: Columns = [
  ["sr", 0, 40],
  ["prn", 40, 95],
  ["name", 95, 275],
  ["division", 275, 325],
  ["email", 325, 455],
  ["phone", 455, 545],
  ["project", 545, 900],
];

const BCA_PROJECT_COLUMNS: Columns = [
  ["sr", 0, 36],
  ["prn", 36, 84],
  ["name", 84, 210],
  ["email", 210, 290],
  ["phone", 290, 360],
  ["project", 360, 900],
];

function readBcaDissertation(file: Buffer, stamp: SourceStamp, ledger: Ledger, track: Track) {
  const honours = track === "Honours";
  for (const row of readPdfTable(
    file,
    honours ? BCA_DISSERTATION_COLUMNS : BCA_PROJECT_COLUMNS,
    { above: 8, below: 3 },
  )) {
    ledger.note(row.prn!, stamp, {
      name: tidyName(row.name ?? ""),
      collegeEmail: collegeEmail(row.email ?? ""),
      phone: (row.phone ?? "").replace(/\D/g, ""),
      programme: "BCA",
      batch: batchOf(row.prn!, "BCA"),
      semester: "VII",
      division: honours ? (row.division ?? "").trim() : "",
      track,
      status: "Active",
    });
    ledger.enrol(row.prn!, stamp);
  }
}

// ─── The BBA-IT documents ───────────────────────────────────────────────────

const BBA_SEM_VII_HONOURS_COLUMNS: Columns = [
  ["sr", 50, 82],
  ["prn", 82, 130],
  ["name", 130, 240],
  ["division", 240, 262],
  ["track", 262, 340],
  ["g1", 340, 410],
  ["g2", 410, 470],
  ["g3", 470, 530],
];

const BBA_SEM_VII_RESEARCH_COLUMNS: Columns = [
  ["sr", 55, 90],
  ["prn", 90, 130],
  ["minor", 130, 250],
  ["name", 250, 420],
  ["track", 420, 700],
];

function readBbaSemVII(file: Buffer, stamp: SourceStamp, ledger: Ledger, track: Track) {
  const honours = track === "Honours";
  const rows = readPdfTable(
    file,
    honours ? BBA_SEM_VII_HONOURS_COLUMNS : BBA_SEM_VII_RESEARCH_COLUMNS,
    // Its ticks sit a whisker below the row they belong to.
    honours ? { above: 8, below: 3 } : {},
  );
  for (const row of rows) {
    const minor = honours ? [1, 2, 3].find((n) => (row[`g${n}`] ?? "").trim()) : undefined;
    ledger.note(row.prn!, stamp, {
      name: tidyName(row.name ?? ""),
      programme: "BBA-IT",
      batch: batchOf(row.prn!, "BBA-IT"),
      semester: "VII",
      division: honours ? (row.division ?? "").trim() : "",
      track,
      status: "Active",
      minorGroup: minor ? String(minor) : "",
    });
    ledger.enrol(row.prn!, stamp);
  }
}

const BBA_ELECTIVE_COLUMNS: Columns = [
  ["sr", 40, 70],
  ["prn", 70, 120],
  ["name", 120, 210],
  ["minor", 210, 350],
  ["section", 350, 500],
];

function readBbaElectives(file: Buffer, stamp: SourceStamp, ledger: Ledger) {
  // Its rows are tall and its cells centred, so a wrapped minor runs a line
  // above the PRN and another below it.
  for (const row of readPdfTable(file, BBA_ELECTIVE_COLUMNS, { above: 12, below: 12 })) {
    const elective = electiveFromLabel(row.minor ?? "", BBA_IT_SEM_V);
    if (!elective) continue;
    const section = /group\s*-?\s*(\d)/i.exec(row.section ?? "")?.[1];
    ledger.note(row.prn!, stamp, {
      name: tidyName(row.name ?? ""),
      programme: "BBA-IT",
      batch: batchOf(row.prn!, "BBA-IT"),
      semester: "V",
      minorGroup: String(elective.group),
      // "NE & IT Infra" names the whole minor rather than a section of it.
      section: section ? `Group ${section}` : "",
      status: "Active",
    });
    ledger.enrol(row.prn!, stamp);
  }
}

// ─── Who has left ───────────────────────────────────────────────────────────

/**
 * The backlog timetables, which are the only place the college writes down
 * that somebody has gone: an Exit/Continue column beside the exam rows.
 */
function readBacklog(file: Buffer, stamp: SourceStamp, ledger: Ledger) {
  for (const sheet of readWorkbook(file)) {
    const { at, columns } = headerOf(sheet.rows);
    if (at < 0) continue;
    const index = {
      prn: findColumn(columns, /^PRN/i),
      name: findColumn(columns, /^Name$/i, /^Name /i),
      // "Exit/Conitnue" — the college's own spelling, in every revision.
      exit: findColumn(columns, /^exit/i),
      college: findColumn(columns, /College Email/i),
      personal: findColumn(columns, /Personal Email/i),
      phone: findColumn(columns, /Mobile/i),
    };
    if (index.prn < 0) continue;

    for (const row of sheet.rows.slice(at + 1)) {
      const prn = (row[index.prn] ?? "").trim();
      if (!PRN.test(prn)) continue;
      // Names and addresses are good from any document, whatever its date —
      // the exam timetables carry a mobile number for people no roster does.
      ledger.note(prn, stamp, {
        name: tidyName(row[index.name] ?? ""),
        collegeEmail: index.college >= 0 ? collegeEmail(row[index.college] ?? "") : "",
        personalEmail: index.personal >= 0 ? personalEmailIn(row[index.personal] ?? "") : "",
        phone: index.phone >= 0 ? (row[index.phone] ?? "").replace(/\D/g, "") : "",
      });
      if (index.exit >= 0 && /^exit$/i.test((row[index.exit] ?? "").trim())) {
        ledger.depart(prn, `marked EXIT in ${stamp.name} (${stamp.date || "undated"})`);
      }
    }
  }
}

/** Last year's consolidated list: names and addresses only, its divisions stale. */
function readOldBcaList(file: Buffer, stamp: SourceStamp, ledger: Ledger) {
  for (const table of readDocxTables(file)) {
    for (const cells of table) {
      if (cells.length < 5 || !PRN.test(cells[1] ?? "")) continue;
      ledger.note(cells[1]!, stamp, {
        name: tidyName(cells[2] ?? ""),
        collegeEmail: collegeEmail(cells[4] ?? ""),
        programme: "BCA",
        batch: batchOf(cells[1]!, "BCA"),
      });
    }
  }
}

// ─── Which reader each document needs ───────────────────────────────────────

type Reader = (file: Buffer, stamp: SourceStamp, ledger: Ledger) => void;

const READERS: Array<{ match: RegExp; read: Reader; what: string }> = [
  {
    match: /^AWC .*\.xlsx$/i,
    read: (f, s, l) => readStudentSheet(f, s, l, true),
    what: "wellness-check roster",
  },
  {
    match: /Mentor List.*\.csv$/i,
    read: readMentorCsv,
    what: "mentor allocation",
  },
  {
    match: /Internal Backlog.*\.xlsx$/i,
    read: readBacklog,
    what: "backlog timetable (who has left)",
  },
  {
    match: /^BCA .*Honours with Research-Project.*\.pdf$/i,
    read: (f, s, l) => readBcaDissertation(f, s, l, "Honours with Research"),
    what: "BCA project list (research students, with mobiles)",
  },
  {
    match: /^BCA .*Honours-Dissertation.*\.pdf$/i,
    read: (f, s, l) => readBcaDissertation(f, s, l, "Honours"),
    what: "BCA dissertation list (honours students, with mobiles)",
  },
  {
    match: /^BCA .*Student List with Honours with Research.*\.pdf$/i,
    read: (f, s, l) => readBcaHonours(f, s, l, "Honours with Research"),
    what: "BCA honours-with-research list",
  },
  {
    match: /^BCA .*Student List with Honours.*\.pdf$/i,
    read: (f, s, l) => readBcaHonours(f, s, l, "Honours"),
    what: "BCA honours list",
  },
  {
    match: /^BBA\(IT\) .*Honours with Research\.pdf$/i,
    read: (f, s, l) => readBbaSemVII(f, s, l, "Honours with Research"),
    what: "BBA-IT honours-with-research list",
  },
  {
    match: /^BBA\(IT\) .*Honours\.pdf$/i,
    read: (f, s, l) => readBbaSemVII(f, s, l, "Honours"),
    what: "BBA-IT honours list",
  },
  {
    match: /Elective List.*\.pdf$/i,
    read: readBbaElectives,
    what: "BBA-IT elective list",
  },
  {
    match: /^BBA\(IT\) .*Student Data and Schedule.*\.xlsx$/i,
    read: (f, s, l) => readStudentSheet(f, s, l, true),
    what: "BBA-IT year lists",
  },
  {
    match: /Regarding AWC in February.*\.xlsx$/i,
    read: (f, s, l) => readStudentSheet(f, s, l, false),
    what: "contact list (no enrolment)",
  },
  {
    match: /Consolidated BCA .*Student List.*\.docx$/i,
    read: readOldBcaList,
    what: "last year's list (names and addresses only)",
  },
];

/**
 * Which semester an intake is in, when the document does not say.
 *
 * An admission list has no semester column because everyone on it is starting;
 * a contact list has none because it is not about a semester at all. Counting
 * from the intake year is arithmetic rather than inference: two semesters a
 * year, and the odd one runs from July.
 */
function semesterFromBatch(batch: string): string {
  const intake = /^(\d{2})-/.exec(batch)?.[1];
  if (!intake) return "";
  const years = 26 - Number(intake);
  return ["I", "III", "V", "VII"][years] ?? "";
}

// ─── Putting it together ────────────────────────────────────────────────────

function main() {
  const ledger = new Ledger();
  const documents = scan(DATA);
  const used = new Map<string, number>();
  const failed: string[] = [];

  for (const document of documents) {
    const reader = READERS.find((r) => r.match.test(document.stamp.name));
    if (!reader) continue;
    try {
      reader.read(readFileSync(document.path), document.stamp, ledger);
      used.set(reader.what, (used.get(reader.what) ?? 0) + 1);
    } catch (error) {
      failed.push(`${document.stamp.name}: ${(error as Error).message}`);
    }
  }

  console.log(`Read ${documents.length} documents under data/, of which:`);
  for (const [what, n] of [...used].sort()) console.log(`  ${String(n).padStart(3)} × ${what}`);
  for (const problem of failed) console.log(`  ! could not read ${problem}`);

  const settled = ledger.settle();

  // The newest roster of a cohort says who is on it. Somebody an older list
  // carries and the newest one does not has left the cohort — that is how a
  // student who withdrew stops appearing, without waiting for anyone to write
  // and say so. Cohorts are compared separately: a list of one year says
  // nothing about another.
  const newestRoster = new Map<string, string>();
  const cohortOf = (record: (typeof settled)[number]) =>
    `${record.values.batch ?? "?"}|${record.values.semester ?? semesterFromBatch(record.values.batch ?? "")}`;
  for (const record of settled) {
    const cohort = cohortOf(record);
    for (const stamp of ledger.enrolledBy(record.prn)) {
      const known = newestRoster.get(cohort) ?? "";
      if (stamp.date > known) newestRoster.set(cohort, stamp.date);
    }
  }

  const students: RosterStudent[] = [];
  const departed: string[] = [];
  const notEnrolled: Array<{ prn: string; batch: string }> = [];
  const droppedOff: string[] = [];

  for (const record of settled) {
    const value = (field: keyof typeof record.values) => record.values[field] ?? "";
    const name = value("name") || record.prn;

    const departure = ledger.departures.get(record.prn);
    if (departure) {
      departed.push(`${record.prn} ${name} — ${departure}`);
      continue;
    }
    if (!ledger.isEnrolled(record.prn)) {
      notEnrolled.push({ prn: record.prn, batch: value("batch") });
      continue;
    }

    const newest = newestRoster.get(cohortOf(record)) ?? "";
    const listedBy = ledger.enrolledBy(record.prn);
    if (newest && !listedBy.some((stamp) => stamp.date === newest)) {
      droppedOff.push(
        `${record.prn} ${name} (${record.values.batch ?? "?"}) — last listed ` +
          `${listedBy.map((s) => s.date || "undated").sort().pop()}, absent from the ${newest} list`,
      );
      continue;
    }

    const inferred = [...record.disagreements];
    const from = record.from.division;
    if (from && from.date) inferred.push(`division from ${from.name} (${from.date})`);

    let semester = value("semester");
    if (!semester) {
      semester = semesterFromBatch(value("batch"));
      if (semester) inferred.push(`semester ${semester} worked out from the intake year`);
    }

    students.push({
      prn: record.prn,
      name,
      collegeEmail: value("collegeEmail"),
      personalEmail: value("personalEmail"),
      phone: value("phone"),
      dateOfBirth: value("dateOfBirth"),
      bloodGroup: value("bloodGroup"),
      category: value("category"),
      programme: value("programme"),
      batch: value("batch"),
      semester,
      division: value("division"),
      track: value("track") as Track,
      status: value("status") === "Inactive" ? "Inactive" : "Active",
      gender: value("gender"),
      majorGroup: Number(value("majorGroup")) || 0,
      minorGroup: Number(value("minorGroup")) || 0,
      section: value("section"),
      source: record.sources
        .map((s) => (s.date ? `${s.date} ${s.name}` : s.name))
        .sort()
        .join(" · "),
      inferred,
    });
  }

  writeFileSync(OUTPUT, toCsv(students));

  const byCohort = new Map<string, { n: number; email: number; division: number; elective: number }>();
  for (const student of students) {
    const key = `${student.batch} · Sem ${student.semester || "?"}`;
    const tally = byCohort.get(key) ?? { n: 0, email: 0, division: 0, elective: 0 };
    tally.n++;
    if (student.collegeEmail) tally.email++;
    if (student.division || student.track) tally.division++;
    if (student.majorGroup || student.minorGroup) tally.elective++;
    byCohort.set(key, tally);
  }

  console.log(`\nWrote ${path.relative(process.cwd(), OUTPUT)} — ${students.length} students\n`);
  console.log("  cohort                     students   email   division   elective");
  for (const [cohort, t] of [...byCohort].sort()) {
    console.log(
      `  ${cohort.padEnd(26)} ${String(t.n).padStart(5)} ${String(t.email).padStart(7)} ${String(t.division).padStart(10)} ${String(t.elective).padStart(10)}`,
    );
  }

  if (droppedOff.length > 0) {
    console.log(
      `\n  ${droppedOff.length} left out, being absent from their cohort's newest list:`,
    );
    for (const student of droppedOff) console.log(`    ${student}`);
  }
  if (departed.length > 0) {
    console.log(`\n  ${departed.length} left out, the college having recorded them as gone:`);
    for (const student of departed) console.log(`    ${student}`);
  }
  if (notEnrolled.length > 0) {
    console.log(
      `\n  ${notEnrolled.length} students are named only by documents that do not put them on` +
        " this semester's roll — an old year list, or a contact list:",
    );
    const byBatch = new Map<string, number>();
    for (const entry of notEnrolled) {
      byBatch.set(entry.batch, (byBatch.get(entry.batch) ?? 0) + 1);
    }
    for (const [batch, n] of [...byBatch].sort()) {
      console.log(`    ${String(n).padStart(4)}  ${batch || "cohort not stated"}`);
    }
  }

  const contested = students.filter((s) => s.inferred.some((i) => i.includes("says")));
  if (contested.length > 0) {
    console.log(`\n  ${contested.length} students whose sources disagree:`);
    for (const student of contested) {
      console.log(`    ${student.prn} ${student.name}`);
      for (const note of student.inferred.filter((i) => i.includes("says"))) {
        console.log(`        ${note}`);
      }
    }
  }
}

main();
