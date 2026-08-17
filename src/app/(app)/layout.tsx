import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell, NAV_COOKIE } from "~/components/app/shell/app-shell";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { HydrateClient } from "~/trpc/server";

/**
 * The real session gate. Middleware only checks for a cookie; this runs in Node,
 * sees the actual session, and is the boundary every app page sits behind.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isActive) redirect("/login?error=AccessDenied");

  const org = await db.organization.findUnique({
    where: { id: session.user.orgId },
    select: { name: true },
  });

  // Read here rather than in the browser so the sidebar is rendered the width
  // it is about to be; discovered after paint, every page would start wide and
  // visibly snap shut.
  const folded = (await cookies()).get(NAV_COOKIE)?.value === "folded";

  return (
    <HydrateClient>
      <AppShell
        defaultFolded={folded}
        permissions={session.user.permissions}
        roleNames={session.user.roles.map((r) => r.name)}
        orgName={org?.name ?? "Plannr"}
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? "",
          image: session.user.image ?? null,
        }}
      >
        {children}
      </AppShell>
    </HydrateClient>
  );
}
