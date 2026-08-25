import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { ApiKeysView } from "~/components/app/api-keys/api-keys-view";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { canOpen } from "~/lib/role-nav";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";

export const metadata: Metadata = {
  title: "API keys",
  description:
    "Credentials for the apps that talk to Plannr on their own — what each one is allowed to do, and what it has been doing.",
};

export default async function ApiKeysPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const permissions = BigInt(session.user.permissions);
  if (!canOpen(permissions, "/settings/api-keys")) redirect("/");

  /**
   * Two gates, because they are two different questions.
   *
   * `canOpen` answers the route's, and `/settings` is declared as
   * `ManageSettings` — that is what puts the item in the sidebar. Every
   * procedure this screen calls is gated on `ManageRoles` instead, for the
   * reason set out at the top of `~/server/api/routers/api-keys`: minting a key
   * is granting authority, which is the same act as writing a role. The two
   * bits do not imply each other, so somebody may hold the first and not the
   * second, and they would otherwise arrive at a screen where every panel
   * answers "forbidden". Sent back to the index instead, which shows them what
   * they can actually open.
   */
  if (!new PermissionBitField(permissions).has(PermissionFlags.ManageRoles)) {
    redirect("/settings");
  }

  const [keys, catalog] = await Promise.all([
    api.apiKeys.list(),
    api.apiKeys.scopeCatalog(),
  ]);

  return (
    <ApiKeysView
      initialKeys={keys}
      catalog={catalog}
      permissions={session.user.permissions}
    />
  );
}
