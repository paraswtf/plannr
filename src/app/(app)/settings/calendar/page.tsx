import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { CalendarSync } from "~/components/app/settings/calendar-sync";
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
      <div className="flex flex-col gap-6 px-4 pt-2 pb-8 sm:px-6 lg:gap-7 lg:px-9 lg:pb-10">
        <CalendarSync />
      </div>
    </>
  );
}
