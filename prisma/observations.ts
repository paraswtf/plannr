/**
 * What each document says about each student, and which of it still holds.
 *
 * The college sends the same student's details a dozen times over four years,
 * and the documents disagree — not because anyone is careless, but because a
 * year gets re-divided, electives are chosen afresh and people leave. So
 * nothing is read straight into a student record. Every document contributes
 * *observations*, each stamped with the date the college sent it, and the
 * record is settled afterwards by asking, field by field, which observation is
 * entitled to be believed.
 *
 * Two kinds of fact, treated differently:
 *
 *  - what a person *is* — their name, address, phone, the programme they are
 *    on — does not expire. The newest statement wins, whatever its age.
 *  - where a person *sits* — semester, division, track, elective, section —
 *    expires every semester. Only a document from this semester may say it,
 *    and among those the newest wins.
 *
 * When two sources of equal standing disagree, both are kept and the
 * disagreement is recorded on the student rather than resolved silently.
 */

import { laterSource, type SourceStamp } from "../src/lib/roster";

/** Facts that stay true: the newest source wins, however old. */
export const DURABLE = [
  "name",
  "collegeEmail",
  "personalEmail",
  "phone",
  "gender",
  "dateOfBirth",
  "bloodGroup",
  "category",
  "programme",
  "batch",
] as const;

/** Facts that expire with the semester: only a current source may state them. */
export const PERISHABLE = [
  "semester",
  "division",
  "track",
  "majorGroup",
  "minorGroup",
  "section",
  "status",
] as const;

export type Field = (typeof DURABLE)[number] | (typeof PERISHABLE)[number];

const perishes = new Set<string>(PERISHABLE);

export interface Observation {
  prn: string;
  field: Field;
  value: string;
  stamp: SourceStamp;
}

export interface Settled {
  prn: string;
  values: Partial<Record<Field, string>>;
  /** Which document each settled value came from. */
  from: Partial<Record<Field, SourceStamp>>;
  /** Every document that mentioned this student at all. */
  sources: SourceStamp[];
  /** Where sources of equal standing disagreed, in words. */
  disagreements: string[];
}

export class Ledger {
  private readonly observations: Observation[] = [];
  /** PRNs seen in a document that establishes who is enrolled this semester. */
  private readonly enrolled = new Map<string, SourceStamp[]>();
  private readonly departed = new Map<string, string>();

  /** Records what one document says about one student. */
  note(prn: string, stamp: SourceStamp, values: Partial<Record<Field, string>>) {
    for (const [field, value] of Object.entries(values)) {
      const text = (value ?? "").toString().trim();
      if (text) this.observations.push({ prn, field: field as Field, value: text, stamp });
    }
  }

  /**
   * Marks a student as on this semester's roll.
   *
   * Only a roster does this. A contact list or an exemption list mentions
   * people without saying they are still enrolled, and a document from a past
   * semester says only that they once were.
   */
  enrol(prn: string, stamp: SourceStamp) {
    if (!stamp.current) return;
    (this.enrolled.get(prn) ?? this.enrolled.set(prn, []).get(prn)!).push(stamp);
  }

  /** Records a student the college says has left, with what it gave as reason. */
  depart(prn: string, reason: string) {
    this.departed.set(prn, reason);
  }

  get departures(): Map<string, string> {
    return this.departed;
  }

  /** Whether any current roster names this student. */
  isEnrolled(prn: string): boolean {
    return this.enrolled.has(prn);
  }

  /** The dates of the rosters that named this student. */
  enrolledBy(prn: string): SourceStamp[] {
    return this.enrolled.get(prn) ?? [];
  }

  /**
   * Settles every student, one field at a time.
   *
   * A field takes the value from the source with the best claim: for something
   * that expires, only sources from this semester are considered at all.
   */
  settle(): Settled[] {
    const byStudent = new Map<string, Observation[]>();
    for (const observation of this.observations) {
      const list = byStudent.get(observation.prn) ?? byStudent.set(observation.prn, []).get(observation.prn)!;
      list.push(observation);
    }

    const settled: Settled[] = [];
    for (const [prn, observations] of byStudent) {
      const values: Settled["values"] = {};
      const from: Settled["from"] = {};
      const disagreements: string[] = [];

      const fields = new Set(observations.map((o) => o.field));
      for (const field of fields) {
        const candidates = observations.filter(
          (o) => o.field === field && (!perishes.has(field) || o.stamp.current),
        );
        if (candidates.length === 0) continue;

        let best = candidates[0]!;
        for (const candidate of candidates.slice(1)) {
          if (laterSource(candidate.stamp, best.stamp) === candidate.stamp) best = candidate;
        }
        values[field] = best.value;
        from[field] = best.stamp;

        // A name spelt two ways is not a disagreement worth anybody's time;
        // only where a student sits can two documents meaningfully conflict.
        if (!perishes.has(field)) continue;

        // Only a source of the same date can contradict the winner; anything
        // older has simply been superseded and is not worth reporting.
        const rivals = candidates.filter(
          (c) => c.value !== best.value && c.stamp.date === best.stamp.date,
        );
        const older = candidates.filter(
          (c) => c.value !== best.value && c.stamp.date !== best.stamp.date && c.stamp.current,
        );
        for (const rival of [...rivals, ...older]) {
          disagreements.push(
            `${field}: ${best.stamp.name} (${best.stamp.date || "undated"}) says ${best.value},` +
              ` ${rival.stamp.name} (${rival.stamp.date || "undated"}) says ${rival.value}`,
          );
        }
      }

      settled.push({
        prn,
        values,
        from,
        sources: [...new Map(observations.map((o) => [o.stamp.name + o.stamp.date, o.stamp])).values()],
        disagreements,
      });
    }
    return settled;
  }
}
