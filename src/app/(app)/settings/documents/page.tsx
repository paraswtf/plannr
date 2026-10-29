import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { DocumentsSettings } from "~/components/app/settings/documents-settings";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Documents",
  description:
    "The header and footer printed on every question paper set in Plannr.",
};

export default async function DocumentsSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const permissions = BigInt(session.user.permissions);
  if (!canOpen(permissions, "/settings/documents")) redirect("/");

  // `/settings` opens for anybody with a day of their own, for the sake of the
  // personal sections; this one is the institution's letterhead, so it asks
  // for the bit every procedure behind it checks.
  if (
    !new PermissionBitField(permissions).has(PermissionFlags.ManageSettings)
  ) {
    redirect("/settings");
  }

  return <DocumentsSettings />;
}
