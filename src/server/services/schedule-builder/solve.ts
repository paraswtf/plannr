/**
 * The timetable solver.
 *
 * Given "these groups need this many lectures a week, taught by these people,
 * in a room like this", it lays them out on a weekly grid without ever putting
 * a room, a teacher or a class in two places at once.
 *
 * Pure and synchronous on purpose: no database, no clock, no randomness. The
 * same demand always produces the same timetable, which matters more than it
 * might seem — a scheduler who regenerates after one small edit should see one
 * small change, not a reshuffled week. Everything that varies (what is already
 * timetabled, how big a group is, which rooms exist) arrives as input.
 *
 * The approach is greedy placement in most-constrained-first order, followed by
 * a bounded repair pass that tries to shift a blocking session out of the way.
 * Timetabling is NP-hard, so this is not exhaustive; it is fast, predictable,
 * and honest about what it could not fit. Anything left over comes back as an
 * unplaced session with a reason, which is the answer a scheduler actually
 * needs — "these four will not fit, here is why" beats silence.
 */

import type { RoomFeatureName } from "~/components/app/booking/room-fit";
import type { RoomTypeName } from "~/lib/schedule-plan";

// ─── Inputs ─────────────────────────────────────────────────────────────────

export interface SolverRoom {
  id: string;
  code: string;
  capacity: number;
  type: RoomTypeName;
  features: RoomFeatureName[];
}

/** One line of demand, as the solver sees it. */
export interface SolverRequirement {
  id: string;
  groupId: string;
  /** Class title, e.g. "Data Structures". */
  subject: string;
  sessionsPerWeek: number;
  durationMinutes: number;
  facultyIds: string[];
  requiredFeatures: RoomFeatureName[];
  roomType: RoomTypeName | null;
  /** Seats the room must have, over and above the group's own size. */
  minCapacity: number | null;
  /** Tried first; the solver falls back to any fitting room. */
  preferredRoomId: string | null;
}

/**
 * A slot that is already spoken for. Live classes are projected onto the weekly
 * grid before they get here, and sessions the planner pinned are busy too.
 */
export interface BusyBlock {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  roomId?: string | null;
  groupId?: string | null;
  facultyIds?: string[];
  /** Shown when this block is the reason something could not be placed. */
  label?: string;
}

/** A placement the solver must keep exactly as it is. */
export interface PinnedSession {
  requirementId: string | null;
  sessionId: string;
  dayOfWeek: number;
  startMinutes: number;
  durationMinutes: number;
  roomId: string | null;
  groupId: string;
  facultyIds: string[];
}

export interface SolveOptions {
  /** ISO weekdays the timetable may use, 1 = Monday … 7 = Sunday. */
  workingDays: number[];
  /** Working window, in minutes from local midnight. */
  dayStartMinutes: number;
  dayEndMinutes: number;
  /** Candidate starts sit on this grid, anchored at `dayStartMinutes`. */
  slotMinutes: number;
  /** Most sessions one group may be given in a day. 0 means no cap. */
  maxPerDay: number;
  /** Prefer to put a subject's weekly sessions on different days. */
  spreadAcrossDays: boolean;
}

export interface SolveInput {
  requirements: SolverRequirement[];
  rooms: SolverRoom[];
  /** How many students each group has, for capacity checks. */
  groupSizes: Record<string, number>;
  busy: BusyBlock[];
  pinned: PinnedSession[];
  options: SolveOptions;
}

// ─── Outputs ────────────────────────────────────────────────────────────────

export interface SolvedSession {
  requirementId: string;
  /** 1-based index of this lecture within its requirement's weekly count. */
  index: number;
  title: string;
  groupId: string;
  facultyIds: string[];
  durationMinutes: number;
  dayOfWeek: number | null;
  startMinutes: number | null;
  roomId: string | null;
  /** Why it could not be placed. Null when it was. */
  reason: string | null;
}

export interface SolveResult {
  /**
   * The generated sessions — pinned ones are *not* included. They were passed
   * in as fixed points and the caller already has them; returning them would
   * invite a caller to write them back and lose their ids.
   */
  sessions: SolvedSession[];
  placed: number;
  unplaced: number;
  /** How many sessions the repair pass had to move to make room. */
  relocated: number;
}

// ─── Occupancy ──────────────────────────────────────────────────────────────

interface Interval {
  start: number;
  end: number;
  /** What the interval is called, for the message when it blocks something. */
  label: string;
}

/** Half-open overlap: two things touching at an endpoint do not clash. */
const overlaps = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean => aStart < bEnd && bStart < aEnd;

/**
 * Who is busy when, keyed by resource and weekday.
 *
 * One structure serves rooms, groups and faculty because the question is the
 * same for all three — "is this thing free from A to B on day D?" — and keeping
 * them in one place means a placement can never update one index and forget
 * another.
 */
class Occupancy {
  /** `${kind}:${id}:${day}` → the intervals that resource is busy for. */
  private readonly byKey = new Map<string, Interval[]>();

  private static key(kind: string, id: string, day: number): string {
    return `${kind}:${id}:${day}`;
  }

  /** The first thing blocking `[start, end)`, or null when the slot is free. */
  blocker(
    kind: string,
    id: string,
    day: number,
    start: number,
    end: number,
  ): Interval | null {
    const list = this.byKey.get(Occupancy.key(kind, id, day));
    if (!list) return null;
    return list.find((i) => overlaps(start, end, i.start, i.end)) ?? null;
  }

  add(
    kind: string,
    id: string,
    day: number,
    start: number,
    end: number,
    label: string,
  ): void {
    const key = Occupancy.key(kind, id, day);
    const list = this.byKey.get(key);
    if (list) list.push({ start, end, label });
    else this.byKey.set(key, [{ start, end, label }]);
  }

  /** Undoes one `add`, for backing a trial placement out during repair. */
  remove(
    kind: string,
    id: string,
    day: number,
    start: number,
    end: number,
  ): void {
    const list = this.byKey.get(Occupancy.key(kind, id, day));
    if (!list) return;
    const at = list.findIndex((i) => i.start === start && i.end === end);
    if (at >= 0) list.splice(at, 1);
  }
}

/** Everything one session occupies while it sits in a slot. */
interface Claim {
  kind: string;
  id: string;
}

function claimsFor(session: {
  roomId: string | null;
  groupId: string;
  facultyIds: string[];
}): Claim[] {
  const claims: Claim[] = [{ kind: "group", id: session.groupId }];
  if (session.roomId) claims.push({ kind: "room", id: session.roomId });
  for (const facultyId of session.facultyIds) {
    claims.push({ kind: "faculty", id: facultyId });
  }
  return claims;
}

// ─── Candidate slots ────────────────────────────────────────────────────────

interface Slot {
  dayOfWeek: number;
  startMinutes: number;
}

/**
 * Every start a session of `durationMinutes` could take, in the order the
 * solver should try them: earlier in the day first, and — when spreading is on
 * — days the requirement has not used yet before days it has.
 *
 * Ordering is where a greedy solver gets its quality. Filling the morning first
 * keeps the week compact, which is what a timetable wants; the day preference
 * is what stops all three of a subject's lectures landing on Monday.
 */
function candidateSlots(
  durationMinutes: number,
  options: SolveOptions,
): Slot[] {
  const slots: Slot[] = [];
  const days = [...options.workingDays].sort((a, b) => a - b);
  for (const day of days) {
    for (
      let start = options.dayStartMinutes;
      start + durationMinutes <= options.dayEndMinutes;
      start += options.slotMinutes
    ) {
      slots.push({ dayOfWeek: day, startMinutes: start });
    }
  }
  return slots;
}

// ─── Room fit ───────────────────────────────────────────────────────────────

/** Why this room cannot take this requirement, or null when it can. */
function roomMismatch(
  room: SolverRoom,
  requirement: SolverRequirement,
  seatsNeeded: number,
): string | null {
  if (requirement.roomType && room.type !== requirement.roomType) {
    return "wrong room type";
  }
  if (room.capacity < seatsNeeded) return "too small";
  const missing = requirement.requiredFeatures.filter(
    (f) => !room.features.includes(f),
  );
  if (missing.length > 0) return `no ${missing.join(", ").toLowerCase()}`;
  return null;
}

/**
 * The rooms that could hold this requirement at all, smallest first.
 *
 * Smallest-first is deliberate: handing a 30-seat tutorial the 300-seat
 * auditorium because it happened to be free first is how a timetable runs out
 * of big rooms by Wednesday. A preferred room jumps the queue.
 */
function feasibleRooms(
  requirement: SolverRequirement,
  rooms: SolverRoom[],
  seatsNeeded: number,
): { rooms: SolverRoom[]; reason: string | null } {
  const fitting = rooms.filter(
    (r) => roomMismatch(r, requirement, seatsNeeded) === null,
  );

  if (fitting.length === 0) {
    // Report the most common reason rather than a bare "no room": "too small"
    // and "no projector" call for very different fixes.
    const reasons = new Map<string, number>();
    for (const room of rooms) {
      const why = roomMismatch(room, requirement, seatsNeeded);
      if (why) reasons.set(why, (reasons.get(why) ?? 0) + 1);
    }
    const worst = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      rooms: [],
      reason: worst
        ? `No room matches: every room is ${worst[0]}.`
        : "There are no rooms to schedule into.",
    };
  }

  const sorted = [...fitting].sort(
    (a, b) => a.capacity - b.capacity || a.code.localeCompare(b.code),
  );
  const preferredAt = sorted.findIndex((r) => r.id === requirement.preferredRoomId);
  if (preferredAt > 0) {
    const [preferred] = sorted.splice(preferredAt, 1);
    sorted.unshift(preferred!);
  }
  return { rooms: sorted, reason: null };
}

// ─── The solver ─────────────────────────────────────────────────────────────

/** A session waiting to be placed, with everything the placer needs. */
interface Pending {
  requirement: SolverRequirement;
  index: number;
  rooms: SolverRoom[];
  /** Set when the requirement can never be placed, whatever the timetable. */
  impossible: string | null;
}

interface Placement {
  dayOfWeek: number;
  startMinutes: number;
  roomId: string;
}

export function solve(input: SolveInput): SolveResult {
  const { options } = input;
  const occupancy = new Occupancy();

  /** How many sessions each group already has on each day, for `maxPerDay`. */
  const perGroupDay = new Map<string, number>();
  const dayKey = (groupId: string, day: number) => `${groupId}:${day}`;
  const bumpDay = (groupId: string, day: number, by: number) =>
    perGroupDay.set(dayKey(groupId, day), (perGroupDay.get(dayKey(groupId, day)) ?? 0) + by);

  // --- seed with what is already taken ------------------------------------
  for (const block of input.busy) {
    const label = block.label ?? "an existing class";
    if (block.roomId) {
      occupancy.add("room", block.roomId, block.dayOfWeek, block.startMinutes, block.endMinutes, label);
    }
    if (block.groupId) {
      occupancy.add("group", block.groupId, block.dayOfWeek, block.startMinutes, block.endMinutes, label);
      bumpDay(block.groupId, block.dayOfWeek, 1);
    }
    for (const facultyId of block.facultyIds ?? []) {
      occupancy.add("faculty", facultyId, block.dayOfWeek, block.startMinutes, block.endMinutes, label);
    }
  }

  for (const pin of input.pinned) {
    const end = pin.startMinutes + pin.durationMinutes;
    for (const claim of claimsFor(pin)) {
      occupancy.add(claim.kind, claim.id, pin.dayOfWeek, pin.startMinutes, end, "a pinned session");
    }
    bumpDay(pin.groupId, pin.dayOfWeek, 1);
  }

  // --- build the work list -------------------------------------------------
  const pending: Pending[] = [];
  for (const requirement of input.requirements) {
    const seatsNeeded = Math.max(
      requirement.minCapacity ?? 0,
      input.groupSizes[requirement.groupId] ?? 0,
    );
    const { rooms, reason } = feasibleRooms(requirement, input.rooms, seatsNeeded);
    for (let index = 1; index <= requirement.sessionsPerWeek; index++) {
      pending.push({ requirement, index, rooms, impossible: reason });
    }
  }

  /**
   * Most-constrained-first: the sessions with the fewest ways to be placed go
   * down while the week is still empty. Ties break on fields rather than on
   * input order so the result does not depend on how the demand was typed in.
   */
  pending.sort((a, b) => {
    if (a.rooms.length !== b.rooms.length) return a.rooms.length - b.rooms.length;
    const durationDiff = b.requirement.durationMinutes - a.requirement.durationMinutes;
    if (durationDiff !== 0) return durationDiff;
    const facultyDiff = b.requirement.facultyIds.length - a.requirement.facultyIds.length;
    if (facultyDiff !== 0) return facultyDiff;
    const subjectDiff = a.requirement.subject.localeCompare(b.requirement.subject);
    if (subjectDiff !== 0) return subjectDiff;
    if (a.requirement.id !== b.requirement.id) {
      return a.requirement.id.localeCompare(b.requirement.id);
    }
    return a.index - b.index;
  });

  const slotCache = new Map<number, Slot[]>();
  const slotsFor = (durationMinutes: number): Slot[] => {
    const cached = slotCache.get(durationMinutes);
    if (cached) return cached;
    const built = candidateSlots(durationMinutes, options);
    slotCache.set(durationMinutes, built);
    return built;
  };

  /** Days a requirement has already used, so spreading can avoid them. */
  const daysUsed = new Map<string, Set<number>>();
  const usedDays = (requirementId: string): Set<number> => {
    const existing = daysUsed.get(requirementId);
    if (existing) return existing;
    const fresh = new Set<number>();
    daysUsed.set(requirementId, fresh);
    return fresh;
  };
  for (const pin of input.pinned) {
    if (pin.requirementId) usedDays(pin.requirementId).add(pin.dayOfWeek);
  }

  const results: SolvedSession[] = [];
  // Each placed session keeps the work item it came from, so the repair pass
  // can re-place it under its real constraints rather than a guess at them.
  const placed_: Array<{ session: SolvedSession; placement: Placement; item: Pending }> = [];
  let relocated = 0;

  /** Marks every resource a placement uses as taken. */
  const claim = (
    session: { roomId: string | null; groupId: string; facultyIds: string[] },
    placement: Placement,
    duration: number,
    label: string,
  ) => {
    const end = placement.startMinutes + duration;
    for (const c of claimsFor({ ...session, roomId: placement.roomId })) {
      occupancy.add(c.kind, c.id, placement.dayOfWeek, placement.startMinutes, end, label);
    }
    bumpDay(session.groupId, placement.dayOfWeek, 1);
  };

  const release = (
    session: { roomId: string | null; groupId: string; facultyIds: string[] },
    placement: Placement,
    duration: number,
  ) => {
    const end = placement.startMinutes + duration;
    for (const c of claimsFor({ ...session, roomId: placement.roomId })) {
      occupancy.remove(c.kind, c.id, placement.dayOfWeek, placement.startMinutes, end);
    }
    bumpDay(session.groupId, placement.dayOfWeek, -1);
  };

  /**
   * The first slot and room this session fits in, or the reason it fits
   * nowhere. `ignoreDays` lets the caller ask for a placement that does not
   * reuse a day, before falling back to one that does.
   */
  const findPlacement = (
    item: Pending,
    opts: { avoidDays?: Set<number> } = {},
  ): { placement: Placement } | { blocked: string } => {
    const { requirement } = item;
    const duration = requirement.durationMinutes;
    let lastBlock = "";
    let sawSlot = false;
    let cappedOut = false;

    for (const slot of slotsFor(duration)) {
      if (opts.avoidDays?.has(slot.dayOfWeek)) continue;
      sawSlot = true;
      const end = slot.startMinutes + duration;

      if (
        options.maxPerDay > 0 &&
        (perGroupDay.get(dayKey(requirement.groupId, slot.dayOfWeek)) ?? 0) >=
          options.maxPerDay
      ) {
        cappedOut = true;
        continue;
      }

      const groupBusy = occupancy.blocker(
        "group",
        requirement.groupId,
        slot.dayOfWeek,
        slot.startMinutes,
        end,
      );
      if (groupBusy) {
        lastBlock = `the group is in ${groupBusy.label}`;
        continue;
      }

      let facultyBusy: Interval | null = null;
      for (const facultyId of requirement.facultyIds) {
        facultyBusy = occupancy.blocker(
          "faculty",
          facultyId,
          slot.dayOfWeek,
          slot.startMinutes,
          end,
        );
        if (facultyBusy) break;
      }
      if (facultyBusy) {
        lastBlock = `the teacher is in ${facultyBusy.label}`;
        continue;
      }

      for (const room of item.rooms) {
        const roomBusy = occupancy.blocker(
          "room",
          room.id,
          slot.dayOfWeek,
          slot.startMinutes,
          end,
        );
        if (!roomBusy) {
          return {
            placement: {
              dayOfWeek: slot.dayOfWeek,
              startMinutes: slot.startMinutes,
              roomId: room.id,
            },
          };
        }
        lastBlock = `every suitable room is taken (${room.code} has ${roomBusy.label})`;
      }
    }

    if (!sawSlot) {
      return {
        blocked:
          "The working week has no slot long enough for a session this length.",
      };
    }
    if (cappedOut && !lastBlock) {
      return {
        blocked: `The group already has its daily maximum of ${options.maxPerDay} sessions on every working day.`,
      };
    }
    return {
      blocked: lastBlock
        ? `Nowhere free in the week: ${lastBlock}.`
        : "Nowhere free in the week.",
    };
  };

  // --- greedy pass ---------------------------------------------------------
  const stillUnplaced: Array<{ item: Pending; session: SolvedSession }> = [];

  for (const item of pending) {
    const { requirement } = item;
    const session: SolvedSession = {
      requirementId: requirement.id,
      index: item.index,
      title: requirement.subject,
      groupId: requirement.groupId,
      facultyIds: requirement.facultyIds,
      durationMinutes: requirement.durationMinutes,
      dayOfWeek: null,
      startMinutes: null,
      roomId: null,
      reason: null,
    };
    results.push(session);

    if (item.impossible) {
      session.reason = item.impossible;
      continue;
    }

    // Try to keep a subject off days it already uses, then relax that.
    const already = usedDays(requirement.id);
    const attempt =
      options.spreadAcrossDays && already.size > 0
        ? findPlacement(item, { avoidDays: already })
        : findPlacement(item);
    const found =
      "placement" in attempt
        ? attempt
        : options.spreadAcrossDays && already.size > 0
          ? findPlacement(item)
          : attempt;

    if ("blocked" in found) {
      session.reason = found.blocked;
      stillUnplaced.push({ item, session });
      continue;
    }

    const { placement } = found;
    session.dayOfWeek = placement.dayOfWeek;
    session.startMinutes = placement.startMinutes;
    session.roomId = placement.roomId;
    claim(session, placement, requirement.durationMinutes, requirement.subject);
    already.add(placement.dayOfWeek);
    placed_.push({ session, placement, item });
  }

  // --- repair pass ---------------------------------------------------------
  // A greedy run can wedge itself: an early session takes the only lab at the
  // only hour a later one could have used. Rather than search the whole space,
  // try to move one already-placed session out of the way — enough to unstick
  // the common case, and bounded so a big plan cannot stall the request.
  if (stillUnplaced.length > 0) {
    let budget = 4000;

    for (const { item, session } of stillUnplaced) {
      if (budget <= 0) break;

      for (const held of placed_) {
        if (budget-- <= 0) break;
        if (held.session === session) continue;
        // Only a session sharing a resource with the stuck one can be in its
        // way; moving anything else would be pure churn.
        const shares =
          held.session.groupId === session.groupId ||
          item.rooms.some((r) => r.id === held.placement.roomId) ||
          held.session.facultyIds.some((f) => session.facultyIds.includes(f));
        if (!shares) continue;

        const heldClaim = { ...held.session, roomId: held.placement.roomId };
        release(heldClaim, held.placement, held.session.durationMinutes);

        const retry = findPlacement(item);
        if ("blocked" in retry) {
          // Put it back exactly where it was and try shifting something else.
          claim(heldClaim, held.placement, held.session.durationMinutes, held.session.title);
          continue;
        }

        // The stuck session goes in first, then the displaced one looks for a
        // new home *under its own constraints* — its real room list, not a
        // guess. If it cannot find one the whole swap is rolled back: trading
        // one unplaced session for another is not progress.
        claim(session, retry.placement, session.durationMinutes, session.title);
        const rehomed = findPlacement(held.item);

        if ("blocked" in rehomed) {
          release(session, retry.placement, session.durationMinutes);
          claim(heldClaim, held.placement, held.session.durationMinutes, held.session.title);
          continue;
        }

        claim(
          { ...held.session, roomId: rehomed.placement.roomId },
          rehomed.placement,
          held.session.durationMinutes,
          held.session.title,
        );
        held.session.dayOfWeek = rehomed.placement.dayOfWeek;
        held.session.startMinutes = rehomed.placement.startMinutes;
        held.session.roomId = rehomed.placement.roomId;
        held.placement = rehomed.placement;

        session.dayOfWeek = retry.placement.dayOfWeek;
        session.startMinutes = retry.placement.startMinutes;
        session.roomId = retry.placement.roomId;
        session.reason = null;
        relocated++;
        break;
      }
    }
  }

  // Report in reading order rather than in the order the solver happened to
  // work through them.
  results.sort(
    (a, b) =>
      a.title.localeCompare(b.title) ||
      a.requirementId.localeCompare(b.requirementId) ||
      a.index - b.index,
  );

  const placed = results.filter((s) => s.dayOfWeek !== null).length;
  return {
    sessions: results,
    placed,
    unplaced: results.length - placed,
    relocated,
  };
}

// ─── Validating a hand edit ─────────────────────────────────────────────────

export interface MoveCheck {
  ok: boolean;
  reason: string | null;
}

/**
 * Whether one session may sit at a given slot, given everything else in the
 * plan. Used when a planner drags a session somewhere by hand — the same rules
 * as the solver, applied to a single move.
 */
export function checkPlacement(
  candidate: {
    sessionId: string;
    groupId: string;
    facultyIds: string[];
    roomId: string | null;
    dayOfWeek: number;
    startMinutes: number;
    durationMinutes: number;
  },
  others: Array<{
    sessionId: string;
    title: string;
    groupId: string;
    facultyIds: string[];
    roomId: string | null;
    dayOfWeek: number | null;
    startMinutes: number | null;
    durationMinutes: number;
  }>,
  busy: BusyBlock[],
  options: Pick<SolveOptions, "dayStartMinutes" | "dayEndMinutes" | "workingDays">,
): MoveCheck {
  const end = candidate.startMinutes + candidate.durationMinutes;

  if (!options.workingDays.includes(candidate.dayOfWeek)) {
    return { ok: false, reason: "That day is not a working day." };
  }
  if (candidate.startMinutes < options.dayStartMinutes || end > options.dayEndMinutes) {
    return { ok: false, reason: "That falls outside the working day." };
  }

  for (const other of others) {
    if (other.sessionId === candidate.sessionId) continue;
    if (other.dayOfWeek !== candidate.dayOfWeek || other.startMinutes === null) {
      continue;
    }
    if (!overlaps(candidate.startMinutes, end, other.startMinutes, other.startMinutes + other.durationMinutes)) {
      continue;
    }
    if (other.groupId === candidate.groupId) {
      return { ok: false, reason: `The group is already in ${other.title} then.` };
    }
    if (candidate.roomId && other.roomId === candidate.roomId) {
      return { ok: false, reason: `That room is taken by ${other.title} then.` };
    }
    if (other.facultyIds.some((f) => candidate.facultyIds.includes(f))) {
      return { ok: false, reason: `The teacher is in ${other.title} then.` };
    }
  }

  for (const block of busy) {
    if (block.dayOfWeek !== candidate.dayOfWeek) continue;
    if (!overlaps(candidate.startMinutes, end, block.startMinutes, block.endMinutes)) {
      continue;
    }
    const label = block.label ?? "an existing class";
    if (block.groupId && block.groupId === candidate.groupId) {
      return { ok: false, reason: `The group is already in ${label} then.` };
    }
    if (candidate.roomId && block.roomId === candidate.roomId) {
      return { ok: false, reason: `That room is taken by ${label} then.` };
    }
    if ((block.facultyIds ?? []).some((f) => candidate.facultyIds.includes(f))) {
      return { ok: false, reason: `The teacher is in ${label} then.` };
    }
  }

  return { ok: true, reason: null };
}
