import { type Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  StructureFlowchart,
  type Structure,
} from "~/components/app/setup/structure-flowchart";
import { SemestersPanel } from "~/components/app/setup/semesters-panel";
import { PageHeader } from "~/components/app/shell/page-header";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { DEFAULT_TIMEZONE } from "~/lib/dates";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "Setup",
  description:
    "The shape of the institution: programmes, their intakes, and the semester everything is dated against.",
};

export default async function SetupPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/setup")) redirect("/");

  const structure = await api.courses.structure();
  const semester = structure?.semester;
  const semesters = await api.semesters.list();

  return (
    <>
      <PageHeader
        title="Setup"
        subtitle="How the institution is arranged, from the degree down to the lecture"
      />
      <div className="flex flex-col gap-6 px-4 pt-2 pb-8 sm:px-6 lg:gap-7 lg:px-9 lg:pb-10">
        {!structure || !semester ? (
          <>
            <Card>
              <p className="text-muted m-0 text-[14px]">
                Nothing is set up yet. Everything here hangs off a semester —
                courses, groups and lectures all belong to one — so that is
                where to start.
              </p>
            </Card>
            <SemestersPanel initial={semesters} />
          </>
        ) : (
          <>
            <StructureFlowchart
              semesterName={semester.name}
              programmes={structure.programmes}
              totals={structure.totals}
            />

            <Card
              title={semester.name}
              action={
                // Two unbreakable halves rather than one string: beside the
                // semester's name there is not 245px of card left on a phone,
                // and a line that breaks between the range and the progress
                // still reads, where one that breaks mid-date does not.
                <span className="text-faint flex flex-wrap justify-end gap-x-1.5 font-mono text-[12px]">
                  {termDates(semester.startDate, semester.endDate).map(
                    (part, i) => (
                      <span key={part} className="whitespace-nowrap">
                        {i > 0 && "· "}
                        {part}
                      </span>
                    ),
                  )}
                </span>
              }
            >
              {structure.programmes.length === 0 ? (
                <p className="text-muted m-0 text-[14px]">
                  No programmes yet. A programme is a degree the college runs,
                  e.g. “BCA”; intakes and groups are filed under one.
                </p>
              ) : (
                <div className="flex flex-col">
                  {structure.programmes.map((programme, i) => (
                    <ProgrammeRow
                      key={programme.id}
                      programme={programme}
                      first={i === 0}
                    />
                  ))}
                </div>
              )}
            </Card>

            <SemestersPanel initial={semesters} />

            <Gaps gaps={structure.gaps} />
          </>
        )}
      </div>
    </>
  );
}

/** A programme and the intakes underneath it, each at the semester it is in. */
function ProgrammeRow({
  programme,
  first,
}: {
  programme: Structure["programmes"][number];
  first: boolean;
}) {
  const groups = programme.batches.reduce((n, b) => n + b.groups, 0);

  return (
    <div
      className="flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0"
      style={
        first ? undefined : { boxShadow: "inset 0 1px 0 var(--hair-soft)" }
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="font-display text-title text-[16px] font-bold">
          {programme.code}
        </span>
        <span className="text-muted text-[13px]">{programme.name}</span>
        <span className="text-faint ml-auto font-mono text-[11.5px]">
          {plural(programme.batches.length, "intake")} ·{" "}
          {plural(groups, "group")}
        </span>
      </div>

      {programme.batches.length === 0 ? (
        <span className="text-faint text-[12.5px]">
          No intakes yet — a batch is one year&rsquo;s admissions to this
          programme.
        </span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {programme.batches.map((batch) => (
            <span
              key={batch.id}
              className="inline-flex items-center gap-2 rounded-[10px] px-2.5 py-1.5"
              style={{ background: "var(--card-soft)" }}
            >
              <span className="text-title text-[12.5px] font-semibold">
                {batch.name}
              </span>
              <span className="text-muted font-mono text-[11.5px]">
                {/* Every intake the programme has ever admitted is listed, so a
                    dash is either one that has finished or one nobody has
                    placed in this semester yet. Printed rather than hidden,
                    because the second of those is a thing to go and fix. */}
                {batch.number ? `Sem ${batch.number}` : "Sem —"} ·{" "}
                {plural(batch.groups, "group")}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The two ways the structure can be incomplete. Both are stated as the sentence
 * a coordinator would say, and both are a link to the screen that fixes them;
 * neither appears at all when there is nothing wrong.
 */
function Gaps({ gaps }: { gaps: Structure["gaps"] }) {
  const { coursesWithoutFaculty: unstaffed, lecturesWithoutCourse: unlinked } =
    gaps;
  if (unstaffed === 0 && unlinked === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-display text-title text-[15px] font-bold">
        Loose ends
      </h2>
      {unstaffed > 0 && (
        <Gap href="/courses" where="Courses">
          {unstaffed === 1
            ? "1 course has nobody assigned to teach it"
            : `${unstaffed} courses have nobody assigned to teach them`}
        </Gap>
      )}
      {unlinked > 0 && (
        <Gap href="/timetable" where="Timetable">
          {unlinked === 1
            ? "1 lecture is not linked to a course"
            : `${unlinked} lectures are not linked to a course`}
        </Gap>
      )}
    </section>
  );
}

function Gap({
  href,
  where,
  children,
}: {
  href: string;
  /** The screen it lands on, named so the click is no surprise. */
  where: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="plr-clip flex items-center gap-2.5 rounded-[var(--radius-card)] px-4 py-3"
      style={{
        background: "color-mix(in srgb, var(--orange) 13%, var(--surface))",
        boxShadow:
          "inset 0 0 0 1px color-mix(in srgb, var(--orange) 45%, transparent)",
      }}
    >
      <Icon name="alert" size={16} color="#a2660f" stroke={2} />
      <span className="text-ink text-[13.5px] font-medium">{children}</span>
      <span className="text-muted ml-auto shrink-0 text-[12.5px] font-semibold">
        {where} →
      </span>
    </Link>
  );
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: DEFAULT_TIMEZONE,
});
const DAY_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DEFAULT_TIMEZONE,
});
const YEAR = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  timeZone: DEFAULT_TIMEZONE,
});

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * "1 Jul – 30 Nov 2026" and "week 7 of 22" — how long the term is and how far
 * in. Handed back in halves rather than as one line so the card can break
 * between them when it is narrow, instead of in the middle of a date.
 */
function termDates(start: Date, end: Date): [range: string, progress: string] {
  const sameYear = YEAR.format(start) === YEAR.format(end);
  const range = `${sameYear ? DAY.format(start) : DAY_YEAR.format(start)} – ${DAY_YEAR.format(end)}`;

  const weeks = Math.max(1, Math.round((+end - +start) / WEEK));
  const now = Date.now();
  if (now < +start || now > +end) return [range, `${weeks} weeks`];

  const week = Math.min(weeks, Math.floor((now - +start) / WEEK) + 1);
  return [range, `week ${week} of ${weeks}`];
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
