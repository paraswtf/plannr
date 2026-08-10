"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "~/components/ui/icon";
import { navFor } from "~/lib/role-nav";

interface AppShellProps {
  /** The user's permission bits, as a decimal string. */
  permissions: string;
  /** Every role held, shown under the institution name. */
  roleNames: string[];
  user: { name: string | null; email: string; image: string | null };
  orgName: string;
  children: React.ReactNode;
}

export function AppShell({
  permissions,
  roleNames,
  user,
  orgName,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  // Someone who teaches and coordinates sees the union of both, so the nav is
  // derived from what they can do rather than from a single role.
  const items = navFor(BigInt(permissions));

  return (
    <div className="flex min-h-screen">
      <aside
        className="bg-surface sticky top-0 flex h-screen w-[244px] shrink-0 flex-col gap-1 px-4 py-6"
        style={{ boxShadow: "inset -1px 0 0 var(--hair)" }}
      >
        <Link href="/" className="mb-7 flex items-center gap-2.5 px-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[15px] font-bold text-white"
            style={{ background: "var(--grad-brand)" }}
          >
            P
          </span>
          <span className="font-display text-title text-[19px] font-bold tracking-[-0.02em]">
            Plannr
          </span>
        </Link>

        <div
          className="mb-5 flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
          style={{ boxShadow: "var(--ring)" }}
        >
          <span
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
            style={{ background: "color-mix(in srgb, var(--slate) 16%, #fff)" }}
          >
            <Icon name="building" size={16} color="var(--slate)" stroke={2} />
          </span>
          <span className="min-w-0">
            <span className="font-display text-title block truncate text-[13.5px] font-bold">
              {orgName}
            </span>
            <span className="text-muted block truncate text-[11px]">
              {roleNames.length > 0 ? roleNames.join(" · ") : "No role"}
            </span>
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="plr-clip flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[14px] font-semibold"
                style={
                  active
                    ? {
                        background: "var(--slate)",
                        color: "#fff",
                        boxShadow: "0 2px 10px rgba(68,88,121,0.32)",
                      }
                    : { color: "var(--muted)" }
                }
              >
                <Icon
                  name={item.icon as IconName}
                  size={17}
                  color={active ? "#fff" : "var(--muted)"}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div
          className="mt-auto flex items-center gap-2.5 pt-4"
          style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
        >
          <span
            className="mt-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
            style={{ background: "var(--slate)" }}
          >
            {(user.name ?? user.email).charAt(0).toUpperCase()}
          </span>
          <span className="mt-4 min-w-0 flex-1">
            <span className="text-title block truncate text-[13px] font-semibold">
              {user.name ?? user.email}
            </span>
            <span className="text-faint block truncate text-[11px]">
              {user.email}
            </span>
          </span>
          <Link
            href="/api/auth/signout"
            title="Sign out"
            className="mt-4 flex h-8 w-8 items-center justify-center rounded-lg"
          >
            <Icon name="logout" size={16} color="var(--faint)" />
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
