import { type Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "~/components/app/shell/page-header";
import { Card } from "~/components/ui/card";
import { Icon, type IconName } from "~/components/ui/icon";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
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
  /** The bit the screen behind it actually needs, not the route's. */
  requires: bigint;
}

const SECTIONS: Section[] = [
  {
    href: "/settings/api-keys",
    title: "API keys",
    blurb:
      "Credentials for the apps that talk to Plannr on their own — what each one may do, and what it has been doing.",
    icon: "key",
    requires: PermissionFlags.ManageRoles,
  },
];

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const permissions = BigInt(session.user.permissions);
  if (!canOpen(permissions, "/settings")) redirect("/");

  const bits = new PermissionBitField(permissions);
  const sections = SECTIONS.filter((section) => bits.has(section.requires));

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="How the institution is run, rather than what is on its timetable"
      />
      <div className="flex flex-col gap-6 px-4 pt-2 pb-8 sm:px-6 lg:gap-7 lg:px-9 lg:pb-10">
        {sections.length === 0 ? (
          <Card>
            <p className="text-muted m-0 text-[14px]">
              Nothing here needs your attention. The settings on this screen are
              about who may act on the institution&rsquo;s behalf, and that sits
              with whoever manages roles.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {sections.map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="plr-clip plr-hoverlift bg-surface flex items-center gap-3.5 rounded-[var(--radius-card)] p-5"
                style={{ boxShadow: "var(--ring), var(--shadow-card)" }}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "var(--card-soft)" }}
                >
                  <Icon
                    name={section.icon}
                    size={19}
                    color="var(--slate)"
                    stroke={1.9}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-display text-title block text-[15px] font-bold">
                    {section.title}
                  </span>
                  <span className="text-muted mt-0.5 block text-[12.5px]">
                    {section.blurb}
                  </span>
                </span>
                <Icon
                  name="chevronRight"
                  size={16}
                  color="var(--muted)"
                  className="shrink-0"
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
