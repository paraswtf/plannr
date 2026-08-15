/**
 * Reading the college's Sem VII honours student lists.
 *
 * Three documents describe the same cohort and none of them alone is enough:
 *
 *  - the Sem VII "with Honours" list names 110 students, their division and the
 *    two elective groups they carry into the fourth year;
 *  - the Sem VII "with Honours with Research" list names 7 more, but has only
 *    name and email — no division, and no electives;
 *  - the Sem V consolidated list, a year older, has the electives and divisions
 *    of everybody, including those 7.
 *
 * So a research student's subjects are *continued* from Sem V, which is what the
 * college does anyway: the elective groups run for the whole degree. Everything
 * carried forward is recorded on the student as an inference, never silently.
 *
 * The functions here are pure and take rows already lifted out of the PDF and
 * the .docx; the byte-level reading lives in `prisma/import-students.ts`.
 */

// ─── The elective structure ─────────────────────────────────────────────────

export interface ElectiveSubject {
  /** The course code the college prints, e.g. "703". */
  code: string;
  title: string;
}

export interface Elective {
  /** 1–7, as the student list numbers them. */
  group: number;
  /** "Data Science" — the name without the "Group -1 - " prefix. */
  name: string;
  /**
   * How the timetable names the same stream in its class lines, e.g. the "DSc"
   * of "BCA Sem VII (DSc) - Advanced Cyber Security". The student list and the
   * timetable are kept by different offices and agree on nothing else.
   */
  code: string;
  /** Groups 1–4 are the majors, 5–7 the minors; every student takes one of each. */
  kind: "MAJOR" | "MINOR";
  subjects: ElectiveSubject[];
}

/**
 * Verbatim from the header of "BCA 23-27 Sem VII Student List with Honours",
 * spelling included — the timetable writes "Advance Anroid Programming" too, so
 * correcting it here would only stop the two matching.
 */
export const SEM_VII_ELECTIVES: readonly Elective[] = [
  {
    group: 1,
    code: "DS",
    name: "Data Science",
    kind: "MAJOR",
    subjects: [
      { code: "703", title: "Python for Data Science" },
      { code: "704", title: "Data Analytics using Ms-Excel" },
    ],
  },
  {
    group: 2,
    code: "AIML",
    name: "Artificial Intelligence and Machine Learning",
    kind: "MAJOR",
    subjects: [
      { code: "705", title: "Natural Language and Responsive AI" },
      { code: "706", title: "Deep Learning" },
    ],
  },
  {
    group: 3,
    code: "CC",
    name: "Cloud Computing",
    kind: "MAJOR",
    subjects: [
      { code: "707", title: "Grid Computing and Utility computing" },
      { code: "708", title: "Cloud based Solution Architecture" },
    ],
  },
  {
    group: 4,
    code: "DSc",
    name: "Data Security",
    kind: "MAJOR",
    subjects: [
      { code: "709", title: "Advanced Cyber Security" },
      { code: "710", title: "Security Management Practices" },
    ],
  },
  {
    group: 5,
    code: "SD",
    name: "Software Development",
    kind: "MINOR",
    subjects: [{ code: "711", title: "Advance Anroid Programming" }],
  },
  {
    group: 6,
    code: "SA",
    name: "System Administration",
    kind: "MINOR",
    subjects: [{ code: "712", title: "Networking Monitoring and Troubleshooting" }],
  },
  {
    group: 7,
    code: "DA",
    name: "Database Administration",
    kind: "MINOR",
    subjects: [{ code: "713", title: "Database Security and Performance Tuning" }],
  },
] as const;

export const electiveOf = (group: number): Elective | undefined =>
  SEM_VII_ELECTIVES.find((elective) => elective.group === group);

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
 * Which elective a timetabled class belongs to, by its title.
 *
 * The timetable and the student list were typed by different people, so the
 * same subject appears as "Advance Anroid Programming" on one and "Advance
 * Android Programming" on the other, and a rescheduled class carries a preamble
 * — "Extra Lecture : BCA Sem VII (AIML) - Deep Learning". A title therefore
 * counts as a match when it equals a subject, contains one, or is a couple of
 * keystrokes away from one. Anything that fits two electives equally well is
 * refused rather than guessed at.
 */
export function electiveForSubject(title: string): Elective | null {
  const text = normalise(title);
  if (!text) return null;

  let best: { elective: Elective; score: number } | null = null;
  let tied = false;

  for (const elective of SEM_VII_ELECTIVES) {
    for (const subject of elective.subjects) {
      const target = normalise(subject.title);
      const score =
        text === target
          ? 3
          : text.includes(target)
            ? 2
            : within(text, target, target.length > 12 ? 2 : 1)
              ? 1
              : 0;
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

/**
 * The stream the timetable itself declares, e.g. "BCA Sem VII (DSc) - …".
 *
 * This is the better of the two signals: it is the college's own code for the
 * elective, and every Sem VII class line carries one, where a title has to
 * survive whatever was typed around it.
 */
export function electiveForStream(rawLine: string): Elective | null {
  const codes = /\(\s*([A-Za-z]{2,5})\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = codes.exec(rawLine))) {
    const code = match[1]!.toLowerCase();
    const elective = SEM_VII_ELECTIVES.find((e) => e.code.toLowerCase() === code);
    if (elective) return elective;
  }
  return null;
}

/**
 * Whether a class line belongs to some cohort other than BCA Sem VII.
 *
 * None of these codes is anybody's private property: "DS" is Data Science here
 * and also the M.Sc's own stream, "DA" is Database Administration here and Data
 * Analytics in the MBA, and BCA Sem V splits into the same seven letters a year
 * earlier. So a line that names its own cohort is believed when it does, and
 * anything that is not this one is refused.
 */
function namesAnotherCohort(rawLine: string): boolean {
  const programme = /\b(b\.?\s*c\.?\s*a\.?|b\.?\s*b\.?\s*a\.?|mba|m\.?\s*sc)\b/i.exec(rawLine);
  if (programme && !/^b\.?\s*c\.?\s*a\.?$/i.test(programme[1]!.trim())) return true;

  const semester = /\bsem\.?\s*([IVX]+)\b/i.exec(rawLine);
  return semester ? semester[1]!.toUpperCase() !== "VII" : false;
}

/**
 * Which elective a class belongs to, from both of the things the timetable
 * knows about it.
 *
 * The stream code decides, and the subject is asked as well so that the two can
 * be seen to agree. Where they disagree the class is left alone: it would take
 * a person to say which is right, and putting it in the wrong elective would
 * quietly hand it to the wrong half of the year.
 */
export function electiveForClass(event: {
  title: string;
  notes?: string | null;
}): { elective: Elective | null; disagreed: boolean } {
  const line = event.notes ?? "";
  if (namesAnotherCohort(line) || namesAnotherCohort(event.title)) {
    return { elective: null, disagreed: false };
  }

  const byStream = electiveForStream(line);
  const bySubject = electiveForSubject(event.title);

  if (byStream && bySubject && byStream.group !== bySubject.group) {
    return { elective: null, disagreed: true };
  }
  return { elective: byStream ?? bySubject, disagreed: false };
}

/**
 * Whether a class is the research coursework the two programmes sit together.
 *
 * Literature Review, Scientific Paper Writing, Ethics in Research and R
 * Programming are taught to the BCA and the BBA-IT honours-with-research
 * students in one room, so the timetable files them under neither cohort but
 * under "Common Batch", where no student can see them. The line says who they
 * are for — "BCA + BBA(IT) Sem VII" — which is specific enough to act on and
 * matches nothing else on the campus-wide bucket.
 */
export function isJointResearchClass(rawLine: string): boolean {
  const text = rawLine.replace(/\s+/g, " ");
  const bothProgrammes = /\bBCA\s*\+\s*B\.?\s*B\.?\s*A\.?\s*\(?\s*IT\s*\)?/i.test(text);
  return bothProgrammes && /\bSem\.?\s*VII\b/i.test(text);
}

// ─── The lists ──────────────────────────────────────────────────────────────

/** One row of any of the three lists, after the columns have been read off. */
export interface ListRow {
  prn: string;
  name: string;
  email: string;
  division?: string | null;
  /** The elective groups ticked on that row, e.g. [2, 5]. */
  groups: number[];
}

export type HonoursTrack = "HONOURS" | "HONOURS_WITH_RESEARCH";

export interface RosterStudent {
  prn: string;
  name: string;
  email: string;
  /** "A" | "B" | "C" for the honours divisions; null for research students. */
  division: string | null;
  track: HonoursTrack;
  /** Elective group 1–4. */
  major: number;
  /** Elective group 5–7. */
  minor: number;
  /** Anything not stated by this student's own list, and where it came from. */
  inferred: string[];
}

export interface Roster {
  students: RosterStudent[];
  /** Students who could not be placed, with the reason. */
  rejected: Array<{ prn: string; name: string; reason: string }>;
  /** Whose Sem VII choice differs from what they took in Sem V. */
  changedSince: Array<{ prn: string; name: string; from: number[]; to: number[] }>;
}

/** ALL-CAPS as the college writes it, softened to how a person is addressed. */
export function tidyStudentName(name: string): string {
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

const splitElectives = (groups: number[]) => ({
  major: groups.find((group) => group <= 4),
  minor: groups.find((group) => group >= 5),
});

/**
 * Merges the three lists into the roster the app should hold.
 *
 * Only the honours students are wanted: everybody else in the Sem V list is a
 * student of the same batch who did not take honours, and is deliberately left
 * out. Sem V is consulted for two things only — the electives of the research
 * students, whose own list omits them, and a division where the Sem VII list
 * left the cell empty.
 */
export function buildRoster(lists: {
  honours: ListRow[];
  research: ListRow[];
  semV: ListRow[];
}): Roster {
  const previous = new Map(lists.semV.map((row) => [row.prn, row]));
  const students: RosterStudent[] = [];
  const rejected: Roster["rejected"] = [];
  const changedSince: Roster["changedSince"] = [];
  const seen = new Set<string>();

  const place = (row: ListRow, track: HonoursTrack) => {
    if (seen.has(row.prn)) {
      rejected.push({ prn: row.prn, name: row.name, reason: "listed twice" });
      return;
    }
    seen.add(row.prn);

    const inferred: string[] = [];
    const last = previous.get(row.prn);

    // The research list carries no electives at all, so they continue.
    let groups = row.groups;
    if (groups.length === 0) {
      if (!last) {
        rejected.push({
          prn: row.prn,
          name: row.name,
          reason: "no electives on this list and not in the Sem V list either",
        });
        return;
      }
      groups = last.groups;
      inferred.push(`electives continued from Sem V (${last.groups.join(" and ")})`);
    } else if (last && last.groups.join() !== groups.join()) {
      changedSince.push({ prn: row.prn, name: row.name, from: last.groups, to: groups });
    }

    const { major, minor } = splitElectives(groups);
    if (major === undefined || minor === undefined) {
      rejected.push({
        prn: row.prn,
        name: row.name,
        reason: `expected one major (1-4) and one minor (5-7), got [${groups.join(", ")}]`,
      });
      return;
    }

    // Research students sit as their own cohort, so a division would be a guess;
    // an honours student missing one only ever means an empty cell.
    let division = row.division?.trim() ?? null;
    if (division === "") division = null;
    if (!division && track === "HONOURS" && last?.division) {
      division = last.division.trim();
      inferred.push(`division ${division} continued from Sem V`);
    }

    students.push({
      prn: row.prn,
      name: tidyStudentName(row.name),
      email: row.email.trim().toLowerCase(),
      division,
      track,
      major,
      minor,
      inferred,
    });
  };

  for (const row of lists.honours) place(row, "HONOURS");
  for (const row of lists.research) place(row, "HONOURS_WITH_RESEARCH");

  return { students, rejected, changedSince };
}
