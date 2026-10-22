import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { PushSettings } from "~/components/app/settings/push-settings";
import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Notifications",
  description:
    "Hear on your phone the moment one of your classes moves, is cancelled or is added.",
};

export default async function NotificationsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canOpen(BigInt(session.user.permissions), "/settings")) redirect("/");

  // No second permission check, for the reason the Siri and calendar screens
  // beside it have none: this grants nothing. It asks one device to listen for
  // changes to classes the person can already see.
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Hear about a changed class the moment it changes"
      />
      <PageBody width="narrow">
        <PushSettings />
      </PageBody>
    </>
  );
}
