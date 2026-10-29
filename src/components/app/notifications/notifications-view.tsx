"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Segmented } from "~/components/ui/segmented";

import { Inbox } from "./inbox";
import { NotificationPreferences } from "./preferences";

export type NotificationsTab = "inbox" | "settings";

const TABS: { value: NotificationsTab; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "settings", label: "Settings" },
];

/**
 * The Notifications tab: what has happened, and how you want to hear about it.
 *
 * One screen with two views rather than an inbox here and a settings page under
 * /settings, because the moment somebody wants to change what they hear is the
 * moment they are looking at what they heard. The view is kept in the address
 * so a link from elsewhere (the old settings page, a push that says it is
 * turned off) can open straight on the settings.
 */
export function NotificationsView({
  initialTab,
}: {
  initialTab: NotificationsTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<NotificationsTab>(initialTab);
  // The page stays mounted when a link elsewhere (the bell, the settings
  // index) changes only the query, so follow the address it now has. Our own
  // `router.replace` comes back here with the value already chosen.
  useEffect(() => setTab(initialTab), [initialTab]);

  const choose = (next: NotificationsTab) => {
    setTab(next);
    router.replace(
      next === "settings" ? "/notifications?view=settings" : "/notifications",
      { scroll: false },
    );
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Changes to your classes, your requests and what waits on you"
      />
      <PageBody width="narrow" className="flex flex-col gap-6">
        <Segmented
          items={TABS}
          value={tab}
          onChange={choose}
          ariaLabel="View"
        />
        {tab === "inbox" ? <Inbox /> : <NotificationPreferences />}
      </PageBody>
    </>
  );
}
