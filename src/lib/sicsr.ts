/**
 * Reading the SICSR timetable export.
 *
 * The source is an MRBS install repurposed as a timetable, so only two things
 * in it are structured: the booking *type*, which is a cohort, and the room and
 * times. Everything academic — subject, teacher, stream — lives in one free-text
 * field typed by hand by whoever entered the class, with no agreed format.
 *
 * So: the cohort is trusted, and the text is *inferred* from, carefully and with
 * the raw string always kept. Everything here is pure, and tested against
 * strings taken verbatim from the live export.
 */

// ─── Cohorts ────────────────────────────────────────────────────────────────

/** How a cohort label divides its programme. Mirrors `GroupKind`. */
export type CohortKind = "DIVISION" | "MAJOR" | "MINOR" | "SUBJECT" | "OTHER";

export interface Cohort {
  /** The single case-sensitive letter MRBS files the class under. */
  code: string;
  /** The label as the timetable writes it, e.g. "BCA (V) - Div. C". */
  label: string;
  /** Programme code as this app spells it, e.g. "BCA"; null for campus events. */
  programme: string | null;
  /** Semester in roman numerals, e.g. "V"; null when the label has none. */
  semester: string | null;
  /** Division letter, e.g. "C". */
  division: string | null;
  /** A named stream inside the cohort, e.g. "DS", "BFM", "Honours with Research". */
  stream: string | null;
  kind: CohortKind;
  /** Campus-wide buckets — an exam, a meetup, a break — rather than a cohort. */
  isEvent: boolean;
}

/** Buckets that are not cohorts at all: nobody is "in" them. */
const EVENT_LABELS = new Set([
  "guest lecture",
  "exam",
  "meetups",
  "break",
]);

/** The programmes, as spelt in the export, normalised to one code each. */
const PROGRAMMES: Array<{ match: RegExp; code: string; name: string }> = [
  { match: /^bca/i, code: "BCA", name: "Bachelor of Computer Applications" },
  {
    match: /^bba-?it|^b\.?b\.?a\.?\s*\(it\)/i,
    code: "BBA-IT",
    name: "BBA (Information Technology)",
  },
  {
    match: /^mba-?it|^mba\s*\(it\)/i,
    code: "MBA-IT",
    name: "MBA (Information Technology)",
  },
  {
    match: /^mba-?dt|^mba\s*\(dt\)/i,
    code: "MBA-DT",
    name: "MBA (Digital Transformation)",
  },
  {
    match: /^msc-?ca|^msc\s*\(ca\)/i,
    code: "MSc-CA",
    name: "M.Sc (Computer Applications)",
  },
];

/** The programme a label or free-text line belongs to, by its opening words. */
export function programmeOf(text: string): { code: string; name: string } | null {
  const trimmed = text.trim();
  for (const programme of PROGRAMMES) {
    if (programme.match.test(trimmed)) {
      return { code: programme.code, name: programme.name };
    }
  }
  return null;
}

/**
 * Reads one line of the colour key, e.g. "BCA (V) - Div. C".
 *
 * The shapes in the live legend are: "<PROG> (<SEM>) - Div. <X>",
 * "<PROG> (<SEM>) - Major/Minor Courses", "<PROG> (<SEM>) - <STREAM>",
 * "<PROG> (<SEM>)" alone, and the five campus buckets.
 */
export function parseCohortLabel(code: string, label: string): Cohort {
  const clean = label.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();

  if (EVENT_LABELS.has(lower) || lower === "common batch") {
    return {
      code,
      label: clean,
      programme: null,
      semester: null,
      division: null,
      stream: null,
      kind: "OTHER",
      // "Common Batch" is everyone at once, which is a cohort of sorts, but it
      // has no programme and no roster, so it is filed with the events.
      isEvent: true,
    };
  }

  const programme = programmeOf(clean);
  const semester = /\(([IVX]+)\)/.exec(clean)?.[1] ?? null;
  const division = /Div\.?\s*([A-Z])\b/i.exec(clean)?.[1] ?? null;

  // Whatever follows the programme and semester, when it is not a division.
  const tail = clean.includes(" - ")
    ? clean.slice(clean.indexOf(" - ") + 3).trim()
    : "";

  let kind: CohortKind = "OTHER";
  let stream: string | null = null;
  if (division) {
    kind = "DIVISION";
  } else if (/major/i.test(tail)) {
    kind = "MAJOR";
  } else if (/minor/i.test(tail)) {
    kind = "MINOR";
  } else if (tail) {
    kind = "SUBJECT";
    stream = tail;
  } else {
    // "MBA-DT (III)" with nothing after it is the whole year sitting together.
    kind = "DIVISION";
  }
  if (division && /honours/i.test(clean)) stream = "Honours";

  return {
    code,
    label: clean,
    programme: programme?.code ?? null,
    semester,
    division,
    stream,
    kind,
    isEvent: false,
  };
}

/**
 * Which intake a semester belongs to, given the academic year in progress.
 *
 * Semester I is the first year, III the second, and so on; the timetable never
 * says which year a cohort was admitted, so it is counted back from the
 * semester. An odd semester runs from the July of its academic year.
 */
export function intakeYear(semester: string | null, academicYear: number): number {
  const index = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"].indexOf(
    semester ?? "",
  );
  if (index < 0) return academicYear;
  // I,II → first year; III,IV → second; and so on.
  return academicYear - Math.floor(index / 2);
}

/** How long each programme runs, for naming an intake "24-28 BCA". */
export const PROGRAMME_YEARS: Record<string, number> = {
  BCA: 4,
  "BBA-IT": 4,
  "MBA-IT": 2,
  "MBA-DT": 2,
  "MSc-CA": 2,
};

export function batchName(programme: string, startYear: number): string {
  const years = PROGRAMME_YEARS[programme] ?? 3;
  const end = startYear + years;
  return `${String(startYear).slice(2)}-${String(end).slice(2)} ${programme}`;
}

// ─── The free-text class line ───────────────────────────────────────────────

export interface ParsedClass {
  /** Best guess at the subject, or the whole line when nothing could be split. */
  subject: string;
  /** Best guess at who teaches it. */
  faculty: string | null;
  /** A stream marker found in the line, e.g. "DS", "Core", "CC". */
  stream: string | null;
  /** True when the line was rescheduled, which the entry says in words. */
  rescheduled: boolean;
  /** The line as it was written, always kept. */
  raw: string;
}

/** Leading noise the timetable staff type before the class itself. */
const PREFIXES = /^(reschedul\w*|extra class|guest lecture|revised)\s*[:\-–]\s*/i;

/**
 * The words a class line opens with that only repeat what the cohort already
 * says: the programme, the semester, the division, and the stream. They are
 * eaten one token at a time from the front, and the moment something else
 * appears the rest is the class itself.
 */
const PROGRAMME_TOKEN = /^(b\.?\s*c\.?\s*a\.?|b\.?\s*b\.?\s*a\.?|mba|m\.?\s*sc\.?)\b\.?/i;
/** "(IT)" only counts as noise directly after the programme that owns it. */
const SPECIALISM_TOKEN = /^\s*\(?\s*(it|dt|ca)\s*\)?/i;
const SEM_TOKEN = /^sem\.?\b/i;
const ROMAN_TOKEN = /^(i{1,3}|iv|v|vi{1,3}|ix|x)\b/i;
const DIV_TOKEN = /^div\.?\b/i;
const DIV_LETTER_TOKEN = /^([A-Z])\b/;
const STREAM_TOKEN = /^\(?(core|elective|cc|ds|cs|da|bfm|itim|hons?|honours)\)?\b/i;
/**
 * A stream nobody wrote down anywhere else: "BCA Sem V (AIML) - …". Any short
 * bracketed code in the preamble is one, which spares the parser a list that
 * would need editing every time a new specialisation opens. The code may not
 * contain a space, so a bracketed phrase — "(Agile Practices)" — is left in the
 * subject where it belongs.
 */
const PAREN_STREAM_TOKEN = /^\s*\(\s*([A-Za-z][A-Za-z.&/]{0,5})\s*\)/;
/**
 * "+" joins two cohorts sharing a room — "BCA + BBA(IT) Sem VII - Literature
 * Review" — so it is a separator like any other, not the start of the subject.
 */
const PUNCTUATION_TOKEN = /^[\s\-–—:,.()+]+/;

/** Words that mean a segment is a phrase, not somebody's name. */
const NOT_A_NAME = /\b(and|of|in|for|the|to|with|&|lab|using|practices)\b/i;

/**
 * What people write in the teacher's place when there is no teacher. Without
 * this the room bookings quietly staff themselves with a Mr Full Day and a
 * Ms Reshedule.
 */
const NOT_A_PERSON =
  /^(by\s+)?(full\s*day|half\s*day|reschedul\w*|reshedul\w*|extra|test|exam|quiz|viva|booked|booking|meeting|holiday|seminar|workshop|session|lecture|practical|class|event|sicsr|sew|scew|iot|tba|tbd|na|nil|all|others?)$/i;

/**
 * Longest first, deliberately: with `mr` before `mrs`, "Mrs. Surbhi Pai" loses
 * its M-r and comes back as "S. Surbhi Pai".
 */
const HONORIFIC = /^(mrs|miss|prof|mr|ms|dr)\.?\s*/i;

/** "By Anagha Gosavi" is Anagha Gosavi, credited rather than named. */
const NAME_LEAD = /^(by|with)\s+/i;

/**
 * Splits a class line into subject and teacher.
 *
 * The separator is a hyphen, with or without spaces, and the same line may use
 * both. Leading segments repeat the cohort, which is already known from the
 * type, so they are dropped; the last segment is the teacher when it reads like
 * a name; the rest is the subject.
 */
export function parseClassText(text: string, knownRooms: string[] = []): ParsedClass {
  const raw = text;
  let working = text.replace(/\s+/g, " ").trim();

  const rescheduled = PREFIXES.test(working);
  working = working.replace(PREFIXES, "").trim();

  // Some entries end with the room, which the Room column already carries.
  for (const room of knownRooms) {
    const trailing = new RegExp(`[\\s-]+${room}\\s*$`);
    if (trailing.test(working)) {
      working = working.replace(trailing, "").trim();
      break;
    }
  }

  const segments = working
    .split(/\s*[-–_]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { subject: raw.trim(), faculty: null, stream: null, rescheduled, raw };
  }

  // Eat the cohort preamble token by token, across segment boundaries: the
  // same words appear with and without separators between them.
  const preamble = stripCohortWords(segments);
  const remaining = preamble.rest;
  const stream = preamble.stream;

  if (remaining.length === 0) {
    return { subject: working || raw.trim(), faculty: null, stream, rescheduled, raw };
  }

  // With only one thing left it is what the class is, not who takes it: a line
  // reading just "Meeting" is not a Mr Meeting.
  const last = remaining[remaining.length - 1]!;
  let faculty =
    remaining.length > 1 && looksLikeName(last) ? tidyName(last) : null;
  let subjectParts = faculty ? remaining.slice(0, -1) : remaining;

  if (!faculty) {
    // Plenty of entries run the teacher straight on with no separator at all —
    // "… Research Methodology Dr. Sarika Sharma". An honorific mid-line is a
    // reliable enough seam to cut on.
    const seam = /\s(mrs|miss|prof|mr|ms|dr)\.?\s+[A-Z]/i.exec(last);
    if (seam && seam.index > 0) {
      const name = last.slice(seam.index).trim();
      if (looksLikeName(name)) {
        faculty = tidyName(name);
        subjectParts = [...remaining.slice(0, -1), last.slice(0, seam.index)];
      }
    }
  }

  // Nothing was taken off either end, so this is not a class line at all but a
  // sentence — an invitation, a notice. Rejoining its pieces with " - " would
  // respace the hyphens inside it ("Batch 2024-28" → "Batch 2024 - 28"), so it
  // is left exactly as typed.
  const untouched = !faculty && subjectParts.length === segments.length;

  const subject = untouched
    ? working
    : subjectParts
        .join(" - ")
        .replace(/\s+/g, " ")
        .replace(/[\s,;:_-]+$/, "")
        .trim();

  return {
    subject: subject || raw.trim(),
    faculty,
    stream,
    rescheduled,
    raw,
  };
}

/**
 * Eats the cohort words off the front of a class line.
 *
 * Works token by token rather than segment by segment because the same words
 * turn up with and without separators — "BCA Sem V Div A - …" and
 * "B.B.A. (IT) V - DIV C …" are the same preamble punctuated differently.
 * Stops at the first token that is not cohort vocabulary, so a subject is never
 * eaten from the middle.
 */
function stripCohortWords(segments: string[]): {
  rest: string[];
  stream: string | null;
} {
  let stream: string | null = null;
  let index = 0;
  let afterProgramme = false;
  let afterDiv = false;

  while (index < segments.length) {
    let text = segments[index]!;
    let consumedSomething = false;

    for (;;) {
      const before = text;
      if (afterProgramme && SPECIALISM_TOKEN.test(text)) {
        // "(IT)" is only noise as the tail of "B.B.A. (IT)"; on its own it
        // could be the start of a subject like "IT Service Management".
        text = text.replace(SPECIALISM_TOKEN, "");
        afterProgramme = false;
      } else if (PAREN_STREAM_TOKEN.test(text)) {
        const marker = PAREN_STREAM_TOKEN.exec(text)![1]!;
        stream ??= marker.toUpperCase();
        text = text.replace(PAREN_STREAM_TOKEN, "");
        afterProgramme = false;
      } else if (PUNCTUATION_TOKEN.test(text)) {
        text = text.replace(PUNCTUATION_TOKEN, "");
      } else if (PROGRAMME_TOKEN.test(text)) {
        text = text.replace(PROGRAMME_TOKEN, "");
        afterProgramme = true;
        afterDiv = false;
      } else if (SEM_TOKEN.test(text)) {
        text = text.replace(SEM_TOKEN, "");
        afterProgramme = false;
        afterDiv = false;
      } else if (ROMAN_TOKEN.test(text)) {
        text = text.replace(ROMAN_TOKEN, "");
        afterProgramme = false;
        afterDiv = false;
      } else if (DIV_TOKEN.test(text)) {
        text = text.replace(DIV_TOKEN, "");
        afterDiv = true;
        afterProgramme = false;
      } else if (afterDiv && DIV_LETTER_TOKEN.test(text)) {
        text = text.replace(DIV_LETTER_TOKEN, "");
        afterDiv = false;
      } else if (STREAM_TOKEN.test(text)) {
        const marker = STREAM_TOKEN.exec(text)![1]!;
        stream ??= marker.toUpperCase();
        text = text.replace(STREAM_TOKEN, "");
        afterProgramme = false;
      } else {
        break;
      }
      if (text === before) break;
      consumedSomething = true;
    }

    const left = text.trim();
    if (left) {
      // Part of this segment survived: that is where the class starts.
      const rest = segments.slice(index);
      rest[0] = left;
      return { rest, stream };
    }
    if (!consumedSomething) break;
    index++;
  }

  return { rest: segments.slice(index), stream };
}

/**
 * Whether a segment reads like a person rather than a subject.
 *
 * An honorific settles it. Otherwise a name is short, capitalised and free of
 * the joining words a subject title uses ("Marketing in Emerging Economies" is
 * three words and a preposition; "Amruta Belhekar" is two and none).
 */
export function looksLikeName(segment: string): boolean {
  const text = segment.trim();
  if (!text) return false;
  if (/\d/.test(text)) return false;

  const named = text
    .replace(NAME_LEAD, "")
    .replace(HONORIFIC, "")
    .replace(NAME_TAIL, "")
    .trim();
  if (NOT_A_PERSON.test(named)) return false;
  const words = named.split(/\s+/).filter(Boolean);
  // An honorific settles what it is, but not how long it may run: "Dr. Bafna
  // Written Test" is a class with a name in it, not a person.
  if (HONORIFIC.test(text)) return words.length > 0 && words.length <= 4;
  if (NOT_A_NAME.test(text)) return false;
  if (words.length > 3) return false;
  // At least one word capitalised, and none of them shouting an acronym.
  return words.every((word) => /^[A-Za-z.'-]+$/.test(word));
}

/** Words that get typed onto the end of a name but are not part of it. */
const NAME_TAIL = /\s+(written\s+test|lecture|test|practical|lab|class|madam|sir)\.?$/i;

/** Normalises a teacher's name so the same person is one record. */
export function tidyName(name: string): string {
  const withoutHonorific = name
    .replace(NAME_LEAD, "")
    .replace(HONORIFIC, "")
    .replace(NAME_TAIL, "")
    .trim();
  const titled = withoutHonorific
    .split(/\s+/)
    .map((word) =>
      word.length > 1
        ? word[0]!.toUpperCase() + word.slice(1).toLowerCase()
        : word.toUpperCase(),
    )
    .join(" ");
  const honorific = HONORIFIC.exec(name)?.[1];
  if (!honorific) return titled;
  const tidyHonorific =
    honorific[0]!.toUpperCase() + honorific.slice(1).toLowerCase();
  return `${tidyHonorific}. ${titled}`;
}

/**
 * The key a teacher is deduplicated on: first and last name, lowercased.
 *
 * Middle names come and go in this data — "Dr. Prafulla Bafna" and "Dr.
 * Prafulla Bharat Bafna" take the same classes — so the ends are compared and
 * the middle ignored. Names that differ at either end stay separate: "Gauri
 * Josh" and "Gauri Joshi" are probably one person and a typo, but guessing that
 * risks merging two real ones.
 */
export const facultyKey = (name: string): string => {
  const words = name
    .replace(NAME_LEAD, "")
    .replace(HONORIFIC, "")
    .replace(NAME_TAIL, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  return `${words[0]}|${words[words.length - 1]!}`;
};

/**
 * Folds names the export clipped back into the whole ones.
 *
 * MRBS truncates its short description column, so the same teacher arrives as
 * "Mr. Chaitanya Kulkarni" from one row and "Mr. Chaitanya Kulkarn" from the
 * next, and sometimes as a bare first name. A cut name is a prefix of the whole
 * one, which is a far safer signal than similarity: "Gauri Josh" folds into
 * "Gauri Joshi", while "Umesh Patwari" and "Umesh Pattwari" — a misspelling,
 * not a truncation — stay apart, as does anything that could go two ways.
 *
 * Takes the keys `facultyKey` produced and returns which key each one belongs
 * to; a key with nothing to fold into maps to itself.
 */
export function canonicalFacultyKeys(keys: Iterable<string>): Map<string, string> {
  const all = [...new Set(keys)].filter(Boolean);
  const split = new Map(all.map((key) => [key, key.split("|") as [string, string]]));

  const longerNames = (key: string) => {
    const [first, last] = split.get(key)!;
    const bare = first === last;
    return all.filter((other) => {
      if (other === key) return false;
      const [otherFirst, otherLast] = split.get(other)!;
      // A first name on its own belongs to the one full name that starts
      // with it — and stays on its own if two teachers share it.
      if (bare) return otherFirst.startsWith(first) && otherFirst !== otherLast;
      if (first === otherFirst) return otherLast.startsWith(last) && otherLast !== last;
      if (last === otherLast) return otherFirst.startsWith(first) && otherFirst !== first;
      return false;
    });
  };

  const candidates = new Map(all.map((key) => [key, longerNames(key)]));
  const resolved = new Map(
    all.map((key) => {
      const options = candidates.get(key)!;
      return [key, options.length === 1 ? options[0]! : key];
    }),
  );

  // A chain — "shilp" → "shilpa sard" → "shilpa sardesai" — settles on its end.
  const settle = (key: string, seen = new Set<string>()): string => {
    const next = resolved.get(key)!;
    if (next === key || seen.has(next)) return key;
    seen.add(key);
    return settle(next, seen);
  };

  // Several candidates are only ambiguous if they are different people: two
  // stages of the same truncated name both lead to the same teacher.
  for (const [key, options] of candidates) {
    if (options.length < 2 || resolved.get(key) !== key) continue;
    const ends = new Set(options.map((option) => settle(option)));
    if (ends.size === 1) resolved.set(key, [...ends][0]!);
  }

  return new Map(all.map((key) => [key, settle(key)]));
}

// ─── Rooms ──────────────────────────────────────────────────────────────────

/** "203 (24)" → the room and how many it seats. */
export function parseRoomHeader(text: string): { name: string; capacity: number | null } {
  const match = /^(.*?)\s*\((\d+)\)\s*$/.exec(text.trim());
  if (!match) return { name: text.trim(), capacity: null };
  return { name: match[1]!.trim(), capacity: Number(match[2]) };
}

/** Which floor a room is on, read off its number. */
export function floorOf(name: string): number {
  const digits = /^(\d)\d{2}$/.exec(name.trim());
  return digits ? Number(digits[1]) : 0;
}

// ─── Times ──────────────────────────────────────────────────────────────────

/**
 * Reads the export's "HH:MM:SS - DayName DD Month YYYY" into its two halves.
 * Returns null rather than guessing when the shape is not what it should be.
 */
export function parseExportTime(
  value: string,
): { time: string; date: string; weekday: string } | null {
  const [time, date] = value.split(" - ");
  if (!time || !date) return null;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(time.trim())) return null;
  const weekday = date.trim().split(" ")[0] ?? "";
  return { time: time.trim(), date: date.trim(), weekday };
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "Wednesday 22 July 2026" plus "08:00:00" → wall-clock fields. */
export function parseExportInstant(
  value: string,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const parts = parseExportTime(value);
  if (!parts) return null;
  const [hour, minute] = parts.time.split(":").map(Number);
  const [, dayText, monthText, yearText] = parts.date.split(/\s+/);
  const month = MONTHS.indexOf((monthText ?? "").toLowerCase()) + 1;
  const day = Number(dayText);
  const year = Number(yearText);
  if (!month || !day || !year || hour === undefined || minute === undefined) {
    return null;
  }
  return { year, month, day, hour, minute };
}
