import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { CalendarSync } from "~/components/app/settings/calendar-sync";
import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Google Calendar",
  description:
    "Copy your classes into a calendar of their own, so they appear on your phone beside everything else.",
};

export default async function CalendarSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/settings")) redirect("/");

  /*
   * No second permission check, for the same reason the Siri screen next door
   * has none: this grants nothing. It copies the classes a person can already
   * see into a calendar only they can read, and it is switched off by the one
   * person it belongs to. Anybody with a timetable may put it on their phone.
   *
   * Whether the institution has it configured at all is a question for the
   * panel, which asks the server — the settings index only lists this section
   * when it is switched on, so a page reached without it is a bookmark or a
   * guess, and the answer is a sentence rather than a redirect.
   */
  return (
    <>
      <PageHeader
        title="Google Calendar"
        subtitle="Your classes, in the calendar you already look at"
      />
      {/* Narrow, like Siri beside it: one panel of status and two buttons,
          which at full width was a sentence adrift in a 1100px box. */}
      <PageBody width="narrow">
        <CalendarSync />
      </PageBody>
    </>
  );
}
