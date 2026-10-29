import { type Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon, type IconName } from "~/components/ui/icon";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { env } from "~/env";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Settings",
  description: "What an administrator can change about how the college runs.",
};

/**
 * The index behind the sidebar's Settings item.
 *
 * `NAV_ITEMS` has linked `/settings` since the nav was written, and until now
 * nothing answered at that path — the one screen that lives under the prefix,
 * API keys, is reached from here. An index rather than making the nav item
 * point straight at `/settings/api-keys`: the prefix is gated on
 * `ManageSettings` and its first tenant on `ManageRoles`, so a link that jumped
 * past this page would bounce anybody holding only the first, and there is
 * plainly more to come under here than one screen.
 */

interface Section {
  href: string;
  title: string;
  blurb: string;
  icon: IconName;
  /** Whose setting it is: one person's own phone, or the institution's. */
  group: Group;
  /** The bit the screen behind it actually needs, not the route's. */
  requires: bigint;
}

type Group = "personal" | "institution";

/**
 * The two audiences this one door serves, in the order they are drawn.
 *
 * The comments on `SECTIONS` always said the personal ones come first and are
 * a different kind of thing from the administrator's; the three identical
 * cards never showed it. Two headed lists do, and a student, who holds only
 * the first, sees one list under one heading and nothing about running the
 * place.
 */
const GROUPS: { id: Group; title: string }[] = [
  { id: "personal", title: "Your phone" },
  { id: "institution", title: "The institution" },
];

const SECTIONS: Section[] = [
  // Siri first, and it is the only section here that is not about running the
  // institution. It is about one person's own phone, it grants nothing they do
  // not already have, and it is the reason this screen opens for a student at
  // all — so putting it under the administrator's sections would bury the only
  // thing most people who reach this page came for.
  {
    href: "/settings/siri",
    title: "Siri",
    blurb:
      "Ask your phone when your next lecture is. Set up a key and a shortcut, once, and then just ask.",
    icon: "sparkles",
    group: "personal",
    requires: PermissionFlags.ViewOwnEvents,
  },
  // Beside Siri, and for the same reason: one person's own phone, granting
  // nothing they do not already have. It was a chip in the schedule's toolbar,
  // competing for a row with the span tabs and the day navigator, none of which
  // it has anything to do with — and it is a thing you set up once.
  {
    href: "/settings/calendar",
    title: "Google Calendar",
    blurb:
      "Copy your classes into a calendar of their own, so they show up on your phone beside everything else.",
    icon: "calendar",
    group: "personal",
    requires: PermissionFlags.ViewOwnEvents,
  },
  // The third thing a person sets up for themselves. It lives in the
  // Notifications tab now, beside the inbox it decides the contents of, and
  // is listed here too because this is where people look for it. Always
  // listed: the inbox works whether or not this server can push.
  {
    href: "/notifications?view=settings",
    title: "Notifications",
    blurb:
      "Choose what you hear about, in Plannr and on your phone: changes to your classes, your requests and what waits on you.",
    icon: "bell",
    group: "personal",
    requires: PermissionFlags.ViewOwnEvents,
  },
  // The letterhead on question papers: the institution's own, so it asks for
  // the bit every procedure behind it checks.
  {
    href: "/settings/documents",
    title: "Documents",
    blurb:
      "The header, footer and logo printed on every question paper written in Plannr.",
    icon: "pencil",
    group: "institution",
    requires: PermissionFlags.ManageSettings,
  },
  {
    href: "/settings/api-keys",
    title: "API keys",
    blurb:
      "Credentials for the apps that talk to Plannr on their own: what each one may do, and what it has been doing.",
    icon: "key",
    group: "institution",
    requires: PermissionFlags.ManageRoles,
  },
];

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const permissions = BigInt(session.user.permissions);
  if (!canOpen(permissions, "/settings")) redirect("/");

  const bits = new PermissionBitField(permissions);
  const sections = SECTIONS.filter(
    (section) =>
      bits.has(section.requires) &&
      /*
       * Nothing is gained by listing a door that opens onto "this institution
       * does not have that". Configuration rather than the database, which is
       * all `calendar.status`'s `available` ever meant.
       *
       * The flag itself rather than `syncEnabled()`, which reads it: that lives
       * in the sync service, and importing it here would drag Prisma, the token
       * crypto and the Google client into a page that wanted one boolean.
       */
      (section.href !== "/settings/calendar" ||
        env.GOOGLE_CALENDAR_SYNC_ENABLED),
  );

  const groups = GROUPS.map((group) => ({
    ...group,
    sections: sections.filter((section) => section.group === group.id),
  })).filter((group) => group.sections.length > 0);
  const runsThePlace = groups.some((group) => group.id === "institution");

  return (
    <>
      <PageHeader
        title="Settings"
        // Only the half of the sentence that is true for the person reading
        // it: a student is shown no institutional setting, so telling them
        // about "how the institution is run" described a page they cannot see.
        subtitle={
          runsThePlace
            ? "Your own devices, and (for whoever runs the place) how the institution is run"
            : "Your own devices"
        }
      />
      <PageBody width="narrow" className="flex flex-col gap-7">
        {groups.length === 0 ? (
          <Card>
            <EmptyState
              compact
              icon="settings"
              title="Nothing here needs your attention."
            >
              The settings on this screen are about who may act on the
              institution&rsquo;s behalf, and that sits with whoever manages
              roles.
            </EmptyState>
          </Card>
        ) : (
          groups.map((group) => (
            <section key={group.id} aria-labelledby={`settings-${group.id}`}>
              <h2
                id={`settings-${group.id}`}
                className="text-muted mb-2 px-1 text-xs font-semibold"
              >
                {group.title}
              </h2>
              {/*
               * One surface per group with hairlines between its rows, rather
               * than a floating card per link: they are entries in one list,
               * and the list is what has the elevation. The rows wash under
               * the pointer instead of lifting, which is calmer for a list and
               * means nothing moves under reduced motion.
               */}
              <ul className="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--ring),var(--shadow-card)]">
                {group.sections.map((section, i) => (
                  <li
                    key={section.href}
                    className={
                      i === 0 ? "" : "shadow-[inset_0_1px_0_var(--hair-soft)]"
                    }
                  >
                    <Link
                      href={section.href}
                      className="group hover:bg-tint-hover flex items-center gap-3.5 px-4 py-3.5 transition-colors duration-150 focus-visible:outline-offset-[-2px] sm:px-5"
                    >
                      <span className="bg-tint text-slate flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]">
                        <Icon name={section.icon} size={18} stroke={1.9} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-title block text-base font-semibold">
                          {section.title}
                        </span>
                        <span className="text-muted mt-0.5 block text-sm">
                          {section.blurb}
                        </span>
                      </span>
                      <Icon
                        name="chevronRight"
                        size={16}
                        stroke={2}
                        className="text-faint group-hover:text-muted shrink-0 transition-colors"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </PageBody>
    </>
  );
}
