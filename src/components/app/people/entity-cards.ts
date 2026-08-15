import type { PickerOption } from "~/components/ui/entity-picker";
import { initialsOf } from "~/components/ui/entity-picker";
import { contactAddress } from "~/lib/people";
import {
  PermissionBitField,
  PERMISSION_CATALOG,
  PermissionFlags,
} from "~/lib/permissions";

/**
 * How each entity appears as a search result.
 *
 * Kept out of the components so the same card is used wherever an entity is
 * picked — a role looks the same in the people filter as in the person modal.
 */

export const roleCard = (r: {
  id: string;
  name: string;
  description: string | null;
  permissions: string;
  isSystem: boolean;
  userCount: number;
}): PickerOption => {
  const bits = new PermissionBitField(BigInt(r.permissions));
  const held = bits.has(PermissionFlags.Administrator)
    ? PERMISSION_CATALOG.length
    : PERMISSION_CATALOG.filter((p) => bits.has(PermissionFlags[p.name]))
        .length;

  return {
    id: r.id,
    label: r.name,
    card: {
      label: r.name,
      avatar: { kind: "initials", text: initialsOf(r.name) },
      title: r.name,
      subtitle: r.description ?? (r.isSystem ? "Built-in role" : "Custom role"),
      badges: [
        { text: r.isSystem ? "built-in" : "custom", tone: "neutral" as const },
      ],
      meta: [
        `${r.userCount} ${r.userCount === 1 ? "person" : "people"}`,
        `${held} permissions`,
      ],
    },
  };
};

export const facultyCard = (f: {
  id: string;
  name: string;
  /** null for anyone the college has sent no address for. */
  email?: string | null;
  department?: string | null;
  isActive?: boolean;
  groupCount?: number;
}): PickerOption => {
  const address = contactAddress(f.email);
  return {
    id: f.id,
    label: f.name,
    card: {
      label: f.name,
      avatar: { kind: "initials", text: initialsOf(f.name) },
      title: f.name,
      subtitle: f.department ?? "No department",
      badges:
        f.isActive === false ? [{ text: "inactive", tone: "red" as const }] : [],
      meta: [
        // A card is glanced at rather than read, so an address that is not
        // there is left out rather than announced in the row of counts.
        ...(address ? [address] : []),
        ...(f.groupCount !== undefined
          ? [`${f.groupCount} ${f.groupCount === 1 ? "group" : "groups"}`]
          : []),
      ],
    },
  };
};

export const groupCard = (g: {
  id: string;
  label: string;
  courseCode: string;
  courseName?: string;
  termName?: string | null;
  studentCount: number;
  eventCount?: number;
  facultyCount?: number;
}): PickerOption => ({
  id: g.id,
  label: g.label,
  card: {
    label: g.label,
    avatar: { kind: "initials", text: g.courseCode.slice(0, 2).toUpperCase() },
    title: g.label,
    subtitle: [g.courseName ?? g.courseCode, g.termName]
      .filter(Boolean)
      .join(" · "),
    badges: [
      {
        text: `${g.studentCount} ${g.studentCount === 1 ? "student" : "students"}`,
        tone: "green" as const,
      },
    ],
    meta: [
      ...(g.eventCount ? [`${g.eventCount} classes`] : []),
      ...(g.facultyCount
        ? [`${g.facultyCount} ${g.facultyCount === 1 ? "teacher" : "teachers"}`]
        : []),
    ],
  },
});
