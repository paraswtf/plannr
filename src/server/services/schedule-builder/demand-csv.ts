/**
 * Reading a term's teaching load out of a spreadsheet.
 *
 * Departments hand this over as a sheet, one line per subject: which group,
 * how many lectures a week, who teaches it, and anything the room has to have.
 * This turns those lines into plan requirements and — crucially — says exactly
 * what it could not resolve, per line, so the sheet can be fixed rather than
 * silently half-imported.
 *
 * Pure: the caller looks the directory up and passes it in, which is what makes
 * the matching rules testable without a database.
 */

import {
  FEATURE_LABELS,
  ROOM_FEATURES,
  type RoomFeatureName,
} from "~/components/app/booking/room-fit";
import { personName } from "~/lib/people";
import { ROOM_TYPES, type RoomTypeName } from "~/lib/schedule-plan";

export const MAX_DEMAND_ROWS = 2000;

export const DEMAND_COLUMNS = [
  "group",
  "subject",
  "sessions",
  "duration",
  "faculty",
  "features",
  "roomType",
  "minCapacity",
  "room",
  "notes",
] as const;

export type DemandColumn = (typeof DEMAND_COLUMNS)[number];

/** Header spellings a departmental sheet is likely to use. */
const HEADER_ALIASES: Record<string, DemandColumn> = {
  group: "group",
  groups: "group",
  division: "group",
  class: "group",
  cohort: "group",
  section: "group",
  subject: "subject",
  course: "subject",
  paper: "subject",
  module: "subject",
  title: "subject",
  sessions: "sessions",
  session: "sessions",
  lectures: "sessions",
  lecture: "sessions",
  count: "sessions",
  "per week": "sessions",
  "sessions per week": "sessions",
  "lectures per week": "sessions",
  hours: "sessions",
  duration: "duration",
  minutes: "duration",
  length: "duration",
  "duration minutes": "duration",
  faculty: "faculty",
  teacher: "faculty",
  teachers: "faculty",
  lecturer: "faculty",
  staff: "faculty",
  "taught by": "faculty",
  features: "features",
  feature: "features",
  requirements: "features",
  requires: "features",
  equipment: "features",
  facilities: "features",
  "room type": "roomType",
  roomtype: "roomType",
  type: "roomType",
  "min capacity": "minCapacity",
  capacity: "minCapacity",
  seats: "minCapacity",
  size: "minCapacity",
  room: "room",
  "preferred room": "room",
  venue: "room",
  notes: "notes",
  note: "notes",
  remarks: "notes",
};

/** Maps a CSV header to a known column, or null when it is not one we use. */
export function matchDemandColumn(header: string): DemandColumn | null {
  const key = header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return HEADER_ALIASES[key] ?? null;
}

/** Splits a multi-value cell: "Dr. Rao | Dr. Sen" or "projector, computers". */
export const splitCell = (value: string | undefined): string[] =>
  (value ?? "")
    .split(/[|,;/]/)
    .map((v) => v.trim())
    .filter(Boolean);

// ─── Directory the resolver matches against ─────────────────────────────────

export interface DemandLookup {
  groups: Array<{ id: string; name: string; label: string | null }>;
  faculty: Array<{
    id: string;
    name: string | null;
    shortName: string | null;
    email: string;
  }>;
  rooms: Array<{ id: string; code: string }>;
}

export type DemandRowStatus = "ready" | "error";

export interface ResolvedDemandRow {
  line: number;
  status: DemandRowStatus;
  /** What was typed, echoed back so the preview can show the original. */
  raw: {
    group: string;
    subject: string;
    sessions: string;
    faculty: string;
    features: string;
  };
  /** Null on an error row. */
  requirement: {
    groupId: string;
    groupLabel: string;
    subject: string;
    sessionsPerWeek: number;
    durationMinutes: number;
    facultyIds: string[];
    facultyNames: string[];
    requiredFeatures: RoomFeatureName[];
    roomType: RoomTypeName | null;
    minCapacity: number | null;
    preferredRoomId: string | null;
    notes: string | null;
    sourceLine: number;
  } | null;
  errors: string[];
  /** Non-fatal notes, e.g. a duration rounded to the slot grid. */
  warnings: string[];
}

export interface ResolveDemandResult {
  rows: ResolvedDemandRow[];
  summary: { ready: number; error: number; sessions: number };
}

// ─── Matching helpers ───────────────────────────────────────────────────────

const normalise = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

/** Strips honorifics and punctuation so "Dr. K. Menon" matches "K Menon". */
const nameKey = (value: string): string =>
  normalise(value)
    .replace(/^(dr|prof|ms|mr|mrs)\.?\s*/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const FEATURE_BY_KEY = new Map<string, RoomFeatureName>();
for (const feature of ROOM_FEATURES) {
  FEATURE_BY_KEY.set(normalise(feature), feature);
  FEATURE_BY_KEY.set(normalise(feature.replace(/_/g, " ")), feature);
  FEATURE_BY_KEY.set(normalise(FEATURE_LABELS[feature]), feature);
}
// The spellings a person actually types.
FEATURE_BY_KEY.set("pc", "COMPUTERS");
FEATURE_BY_KEY.set("pcs", "COMPUTERS");
FEATURE_BY_KEY.set("computer lab", "COMPUTERS");
FEATURE_BY_KEY.set("air conditioning", "AC");
FEATURE_BY_KEY.set("board", "WHITEBOARD");
FEATURE_BY_KEY.set("smartboard", "SMART_BOARD");
FEATURE_BY_KEY.set("microphone", "MIC");
FEATURE_BY_KEY.set("projector screen", "PROJECTOR");

const ROOM_TYPE_BY_KEY = new Map<string, RoomTypeName>();
for (const type of ROOM_TYPES) {
  ROOM_TYPE_BY_KEY.set(normalise(type), type);
  ROOM_TYPE_BY_KEY.set(normalise(type.replace(/_/g, " ")), type);
}
ROOM_TYPE_BY_KEY.set("hall", "LECTURE_HALL");
ROOM_TYPE_BY_KEY.set("classroom", "LECTURE");
ROOM_TYPE_BY_KEY.set("laboratory", "LAB");

/**
 * Reads a session count. "3", "3 lectures" and "3/week" all mean three; an
 * empty cell means one, because a sheet listing subjects one per line without a
 * count is listing one lecture each.
 */
function parseCount(raw: string | undefined): number | null {
  const text = (raw ?? "").trim();
  if (!text) return 1;
  const match = /(\d+(?:\.\d+)?)/.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/**
 * Reads a duration. Bare numbers under 12 are read as hours ("1.5" is 90
 * minutes) and anything larger as minutes, which is how these sheets are
 * written; "90m", "1h30" and "2 hours" are all understood outright.
 */
export function parseDuration(raw: string | undefined): number | null {
  const text = normalise(raw ?? "").replace(/\s+/g, "");
  if (!text) return null;

  const hoursAndMinutes = /^(\d+)h(?:ou?rs?)?(\d{1,2})m?(?:in(?:ute)?s?)?$/.exec(text);
  if (hoursAndMinutes) {
    return Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2]);
  }
  const hours = /^(\d+(?:\.\d+)?)h(?:ou?rs?)?$/.exec(text);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minutes = /^(\d+)m(?:in(?:ute)?s?)?$/.exec(text);
  if (minutes) return Number(minutes[1]);

  const bare = /^(\d+(?:\.\d+)?)$/.exec(text);
  if (!bare) return null;
  const value = Number(bare[1]);
  return value <= 12 ? Math.round(value * 60) : Math.round(value);
}

// ─── The resolver ───────────────────────────────────────────────────────────

export interface ResolveDemandInput {
  records: Array<{ line: number; values: Partial<Record<DemandColumn, string>> }>;
  lookup: DemandLookup;
  /** Candidate starts sit on this grid, so durations are rounded up to it. */
  slotMinutes: number;
  /** The longest session the working day can hold. */
  workingDayMinutes: number;
}

export function resolveDemand(input: ResolveDemandInput): ResolveDemandResult {
  const groupByKey = new Map<string, { id: string; label: string }>();
  for (const group of input.lookup.groups) {
    const label = group.label ?? group.name;
    // Both spellings resolve; a label collision keeps the first, since the
    // section name is the more precise of the two.
    for (const key of [normalise(group.name), normalise(label)]) {
      if (!groupByKey.has(key)) groupByKey.set(key, { id: group.id, label });
    }
  }

  const facultyByKey = new Map<string, { id: string; name: string }>();
  for (const person of input.lookup.faculty) {
    // The address is still the last resort for naming a teacher nobody entered
    // a name for, but a placeholder one is not an address and must not be shown
    // back in the import preview as though the sheet had matched it.
    const display = person.shortName ?? personName(person, "Unnamed");
    const keys = [
      normalise(person.email),
      // The local part, so "k.menon" in a sheet finds k.menon@college.edu.
      normalise(person.email.split("@")[0] ?? ""),
      person.name ? nameKey(person.name) : "",
      person.shortName ? nameKey(person.shortName) : "",
    ].filter(Boolean);
    for (const key of keys) {
      if (!facultyByKey.has(key)) facultyByKey.set(key, { id: person.id, name: display });
    }
  }

  const roomByKey = new Map<string, string>();
  for (const room of input.lookup.rooms) {
    roomByKey.set(normalise(room.code), room.id);
    roomByKey.set(normalise(room.code).replace(/[^a-z0-9]/g, ""), room.id);
  }

  const rows: ResolvedDemandRow[] = [];

  for (const record of input.records.slice(0, MAX_DEMAND_ROWS)) {
    const values = record.values;
    const errors: string[] = [];
    const warnings: string[] = [];

    const raw = {
      group: values.group ?? "",
      subject: values.subject ?? "",
      sessions: values.sessions ?? "",
      faculty: values.faculty ?? "",
      features: values.features ?? "",
    };

    // --- group ------------------------------------------------------------
    const groupText = (values.group ?? "").trim();
    const group = groupText ? groupByKey.get(normalise(groupText)) : undefined;
    if (!groupText) errors.push("Group is required");
    else if (!group) errors.push(`No group called "${groupText}"`);

    // --- subject ----------------------------------------------------------
    const subject = (values.subject ?? "").trim();
    if (!subject) errors.push("Subject is required");
    else if (subject.length > 160) errors.push("Subject is too long");

    // --- how many ---------------------------------------------------------
    const sessionsPerWeek = parseCount(values.sessions);
    if (sessionsPerWeek === null) {
      errors.push(`"${values.sessions}" is not a number of sessions`);
    } else if (sessionsPerWeek > 40) {
      errors.push(`${sessionsPerWeek} sessions a week is not plausible`);
    }

    // --- how long ---------------------------------------------------------
    let durationMinutes = 60;
    if ((values.duration ?? "").trim()) {
      const parsed = parseDuration(values.duration);
      if (parsed === null) {
        errors.push(`"${values.duration}" is not a duration`);
      } else if (parsed <= 0) {
        errors.push("Duration must be more than zero");
      } else if (parsed > input.workingDayMinutes) {
        errors.push("That session is longer than the working day");
      } else {
        durationMinutes = parsed;
      }
    }
    // Sessions have to start on the slot grid, so a length that is not a
    // multiple of it would leave unusable gaps behind every class.
    if (durationMinutes % input.slotMinutes !== 0) {
      const rounded =
        Math.ceil(durationMinutes / input.slotMinutes) * input.slotMinutes;
      if (rounded <= input.workingDayMinutes) {
        warnings.push(`rounded ${durationMinutes} min up to ${rounded} min`);
        durationMinutes = rounded;
      } else {
        errors.push("That session is longer than the working day");
      }
    }

    // --- who teaches it ---------------------------------------------------
    const facultyIds: string[] = [];
    const facultyNames: string[] = [];
    for (const name of splitCell(values.faculty)) {
      const match =
        facultyByKey.get(normalise(name)) ?? facultyByKey.get(nameKey(name));
      if (!match) {
        errors.push(`No faculty member called "${name}"`);
        continue;
      }
      if (!facultyIds.includes(match.id)) {
        facultyIds.push(match.id);
        facultyNames.push(match.name);
      }
    }

    // --- what the room needs ----------------------------------------------
    const requiredFeatures: RoomFeatureName[] = [];
    for (const feature of splitCell(values.features)) {
      const match = FEATURE_BY_KEY.get(normalise(feature));
      if (!match) {
        errors.push(`"${feature}" is not something a room can have`);
        continue;
      }
      if (!requiredFeatures.includes(match)) requiredFeatures.push(match);
    }

    let roomType: RoomTypeName | null = null;
    const roomTypeText = (values.roomType ?? "").trim();
    if (roomTypeText) {
      roomType = ROOM_TYPE_BY_KEY.get(normalise(roomTypeText)) ?? null;
      if (!roomType) errors.push(`"${roomTypeText}" is not a kind of room`);
    }

    let minCapacity: number | null = null;
    const capacityText = (values.minCapacity ?? "").trim();
    if (capacityText) {
      const parsed = Number(capacityText.replace(/[^\d]/g, ""));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        errors.push(`"${capacityText}" is not a number of seats`);
      } else {
        minCapacity = Math.round(parsed);
      }
    }

    let preferredRoomId: string | null = null;
    const roomText = (values.room ?? "").trim();
    if (roomText) {
      preferredRoomId =
        roomByKey.get(normalise(roomText)) ??
        roomByKey.get(normalise(roomText).replace(/[^a-z0-9]/g, "")) ??
        null;
      if (!preferredRoomId) errors.push(`No room called "${roomText}"`);
    }

    if (errors.length > 0 || !group || sessionsPerWeek === null) {
      rows.push({ line: record.line, status: "error", raw, requirement: null, errors, warnings });
      continue;
    }

    rows.push({
      line: record.line,
      status: "ready",
      raw,
      requirement: {
        groupId: group.id,
        groupLabel: group.label,
        subject,
        sessionsPerWeek,
        durationMinutes,
        facultyIds,
        facultyNames,
        requiredFeatures,
        roomType,
        minCapacity,
        preferredRoomId,
        notes: (values.notes ?? "").trim() || null,
        sourceLine: record.line,
      },
      errors,
      warnings,
    });
  }

  const summary = { ready: 0, error: 0, sessions: 0 };
  for (const row of rows) {
    if (row.status === "ready") {
      summary.ready++;
      summary.sessions += row.requirement?.sessionsPerWeek ?? 0;
    } else {
      summary.error++;
    }
  }

  return { rows, summary };
}

/** The header row and an example, offered in the import dialog. */
export const DEMAND_TEMPLATE = `group,subject,sessions,duration,faculty,features,room type,min capacity,room,notes
BCA-A,Data Structures,3,60,Dr. Rao,projector,LECTURE,,,
BCA-A,DS Lab,2,120,Dr. Rao|Dr. Sen,computers,LAB,,,split into two halves
BCA-B,Discrete Maths,4,60,Dr. Menon,,,,,`;
