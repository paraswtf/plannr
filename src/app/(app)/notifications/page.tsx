import { type Metadata } from "next";
import { redirect } from "next/navigation";

import {
  NotificationsView,
  type NotificationsTab,
} from "~/components/app/notifications/notifications-view";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Notifications",
  description:
    "Changes to your classes, answers to your requests and what waits on you, and how you hear about them.",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // No permission check beyond the session: everybody signed in has an inbox,
  // and every procedure behind it reads the caller's own rows and no others.
  const { view } = await searchParams;
  const initialTab: NotificationsTab =
    view === "settings" ? "settings" : "inbox";

  return <NotificationsView initialTab={initialTab} />;
}
