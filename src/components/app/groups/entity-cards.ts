/**
 * How courses and terms appear in the search controls on this screen. Shared by
 * the group and batch forms, which offer the same choices.
 */

/** How a course appears in a search result. */
export const programmeCard = (c: {
  id: string;
  code: string;
  name: string;
  groupCount: number;
}) => ({
  id: c.id,
  label: c.code,
  card: {
    label: c.code,
    avatar: {
      kind: "initials" as const,
      text: c.code.slice(0, 2).toUpperCase(),
    },
    title: c.code,
    subtitle: c.name,
    badges: [
      {
        text: `${c.groupCount} ${c.groupCount === 1 ? "group" : "groups"}`,
        tone: "slate" as const,
      },
    ],
  },
});

export const semesterCard = (t: {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
}) => {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-IN", {
      month: "short",
      year: "numeric",
    }).format(d);
  return {
    id: t.id,
    label: t.name,
    card: {
      label: t.name,
      avatar: { kind: "icon" as const, name: "calendar" as const },
      title: t.name,
      subtitle: `${fmt(t.startDate)} – ${fmt(t.endDate)}`,
      badges: t.isCurrent
        ? [{ text: "current", tone: "green" as const, dot: true }]
        : [],
    },
  };
};
