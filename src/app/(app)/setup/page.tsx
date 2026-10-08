import { type Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  StructureFlowchart,
  type Structure,
} from "~/components/app/setup/structure-flowchart";
import { SemestersPanel } from "~/components/app/setup/semesters-panel";
import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
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
      <PageBody className="flex flex-col gap-6 lg:gap-7">
        {!structure || !semester ? (
          <>
            <Card>
              <EmptyState icon="calendar" title="Nothing is set up yet">
                Everything here hangs off a semester (courses, groups and
                lectures all belong to one), so that is where to start.
              </EmptyState>
            </Card>
            <SemestersPanel initial={semesters} />
          </>
        ) : (
          <>
            {/* What needs fixing comes first. It used to be the last thing on
                the page, under the diagram, the programme listing and the
                semester history, which put the only actionable lines on it
                1,200px down on a laptop and 2,300px down on a phone. It draws
                nothing at all when nothing is wrong, so a healthy page is
                unchanged. */}
            <Gaps gaps={structure.gaps} />

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
                <span className="text-faint flex flex-wrap justify-end gap-x-1.5 font-mono text-xs tabular-nums">
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
                <p className="text-muted text-sm">
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
          </>
        )}
      </PageBody>
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
      className={`flex flex-col gap-2.5 py-4 first:pt-0 last:pb-0 ${
        first ? "" : "shadow-[inset_0_1px_0_var(--hair-soft)]"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="font-display text-title text-md font-semibold tracking-[-0.01em]">
          {programme.code}
        </h3>
        <span className="text-muted text-sm">{programme.name}</span>
        <span className="text-faint ml-auto font-mono text-xs tabular-nums">
          {plural(programme.batches.length, "intake")} ·{" "}
          {plural(groups, "group")}
        </span>
      </div>

      {programme.batches.length === 0 ? (
        <span className="text-muted text-sm">
          No intakes yet. A batch is one year&rsquo;s admissions to this
          programme.
        </span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {programme.batches.map((batch) => (
            <span
              key={batch.id}
              className="bg-tint inline-flex items-center gap-2 rounded-[8px] px-2.5 py-1.5"
            >
              <span className="text-title text-sm font-semibold">
                {batch.name}
              </span>
              <span className="text-muted font-mono text-xs">
                {/* Every intake the programme has ever admitted is listed, so
                    one with no number is either one that has finished or one
                    nobody has placed in this semester yet. Printed rather than
                    hidden, so the second of those can still be spotted, but
                    in words true of both and in the same muted ink as a
                    number: the page cannot tell a graduated intake from a
                    forgotten one, and painting every finished year in the
                    warn ink would flag the past as something to fix. */}
                {batch.number ? (
                  `Sem ${batch.number}`
                ) : (
                  <span className="font-body">No semester</span>
                )}{" "}
                · {plural(batch.groups, "group")}
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
    <section aria-labelledby="loose-ends" className="flex flex-col gap-2.5">
      <h2
        id="loose-ends"
        className="font-display text-title text-md font-semibold tracking-[-0.01em]"
      >
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
    // The warn callout's look, as a link: it needs a decision, and the whole
    // line is the way to the screen that makes it. The pointer deepens its
    // edge and lifts it off the page, the same answer a hovered card gives.
    <Link
      href={href}
      className="plr-clip bg-warn-wash flex min-h-11 items-center gap-2.5 rounded-[12px] px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--warn-line)] hover:shadow-[inset_0_0_0_1.5px_var(--warn-line),var(--shadow-card)]"
    >
      <Icon name="alert" size={16} stroke={2} className="text-warn" />
      <span className="text-ink min-w-0 text-base font-medium">{children}</span>
      <span className="text-warn ml-auto flex shrink-0 items-center gap-1 text-sm font-semibold">
        {where}
        <Icon name="chevronRight" size={14} stroke={2} />
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
 * "1 Jul - 30 Nov 2026" and "week 7 of 22" — how long the term is and how far
 * in. Handed back in halves rather than as one line so the card can break
 * between them when it is narrow, instead of in the middle of a date.
 */
function termDates(start: Date, end: Date): [range: string, progress: string] {
  const sameYear = YEAR.format(start) === YEAR.format(end);
  const range = `${sameYear ? DAY.format(start) : DAY_YEAR.format(start)} - ${DAY_YEAR.format(end)}`;

  const weeks = Math.max(1, Math.round((+end - +start) / WEEK));
  const now = Date.now();
  if (now < +start || now > +end) return [range, `${weeks} weeks`];

  const week = Math.min(weeks, Math.floor((now - +start) / WEEK) + 1);
  return [range, `week ${week} of ${weeks}`];
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
