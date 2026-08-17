"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PlannrLogo } from "~/components/ui/brand";
import { Icon, type IconName } from "~/components/ui/icon";
import { contactAddress, personName } from "~/lib/people";
import { navFor } from "~/lib/role-nav";

/**
 * The frame every screen sits in.
 *
 * Three states, not two. On a phone there is no sidebar at all — a bar with a
 * hamburger, and the nav arrives as an overlay over the page, because 244px of
 * permanent chrome on a 390px screen leaves nothing to read. On a laptop the
 * sidebar is there, and can be folded to a rail of icons for the screens that
 * want the width: the timetable grid and the planner are wide by nature.
 *
 * The fold is remembered in a cookie rather than localStorage so the server
 * renders the sidebar the width it is about to be. Read from the browser after
 * paint, every navigation would start expanded and snap.
 */

interface AppShellProps {
  /** The user's permission bits, as a decimal string. */
  permissions: string;
  /** Every role held, shown under the institution name. */
  roleNames: string[];
  user: { name: string | null; email: string; image: string | null };
  orgName: string;
  /** The fold state the cookie was holding when the page was rendered. */
  defaultFolded?: boolean;
  children: React.ReactNode;
}

/** Name of the cookie the fold state lives in. Read in `(app)/layout.tsx`. */
export const NAV_COOKIE = "plannr-nav";

const FULL = 244;
const RAIL = 68;

export function AppShell({
  permissions,
  roleNames,
  user,
  orgName,
  defaultFolded = false,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  // Someone who teaches and coordinates sees the union of both, so the nav is
  // derived from what they can do rather than from a single role.
  const items = navFor(BigInt(permissions));

  const [folded, setFolded] = useState(defaultFolded);
  const [open, setOpen] = useState(false);
  const hamburger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Arriving somewhere is the end of using the menu. Without this the overlay
  // stays up over the page it was used to reach.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    // The page behind an overlay must not scroll under it, which on a phone is
    // otherwise what a finger drag on the backdrop does.
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = scroll;
      // Put the caret back where it was, or a keyboard lands at the top of the
      // document each time the menu is closed.
      hamburger.current?.focus();
    };
  }, [open]);

  const fold = (next: boolean) => {
    setFolded(next);
    document.cookie = `${NAV_COOKIE}=${next ? "folded" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* The bar that replaces the sidebar once there is no room for one. */}
      <header
        className="bg-surface sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-2 px-3 lg:hidden"
        style={{ boxShadow: "0 1px 0 var(--hair)" }}
      >
        <button
          ref={hamburger}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the menu"
          aria-expanded={open}
          aria-controls="app-nav"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px]"
          style={{ background: "rgba(68,88,121,0.07)" }}
        >
          <Icon name="menu" size={18} color="var(--slate)" stroke={2.2} />
        </button>
        <Link href="/" className="flex min-w-0 items-center">
          <PlannrLogo height={24} wordmarkSize={17} />
        </Link>
      </header>

      {/* The sidebar proper, from the breakpoint where it fits. */}
      <aside
        className="bg-surface sticky top-0 hidden h-screen shrink-0 flex-col gap-1 py-6 transition-[width] duration-200 lg:flex"
        style={{
          width: folded ? RAIL : FULL,
          paddingInline: folded ? 10 : 16,
          boxShadow: "inset -1px 0 0 var(--hair)",
        }}
      >
        <SidebarBody
          items={items}
          pathname={pathname}
          orgName={orgName}
          roleNames={roleNames}
          user={user}
          folded={folded}
          onFold={() => fold(!folded)}
        />
      </aside>

      {/* The same nav as an overlay, for the screens with no room beside it. */}
      {open && (
        <>
          <button
            type="button"
            aria-label="Close the menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default lg:hidden"
            style={{ background: "rgba(16,22,33,0.42)" }}
          />
          <div
            id="app-nav"
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="bg-surface fixed top-0 left-0 z-50 flex h-full w-[272px] max-w-[86vw] flex-col gap-1 overflow-y-auto px-4 py-5 outline-none lg:hidden"
            style={{ boxShadow: "0 0 40px rgba(16,22,33,0.28)" }}
          >
            <div className="mb-6 flex items-center justify-between">
              <Link href="/" className="flex items-center">
                <PlannrLogo height={26} wordmarkSize={18} />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close the menu"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px]"
                style={{ background: "rgba(68,88,121,0.07)" }}
              >
                <Icon name="x" size={16} color="var(--slate)" stroke={2.2} />
              </button>
            </div>
            <SidebarBody
              items={items}
              pathname={pathname}
              orgName={orgName}
              roleNames={roleNames}
              user={user}
              folded={false}
            />
          </div>
        </>
      )}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * What the sidebar contains, drawn the same whether it is beside the page or
 * over it. Only the fold differs, and the overlay is never folded — it is
 * summoned deliberately and then wants to be read.
 */
function SidebarBody({
  items,
  pathname,
  orgName,
  roleNames,
  user,
  folded,
  onFold,
}: {
  items: ReturnType<typeof navFor>;
  pathname: string;
  orgName: string;
  roleNames: string[];
  user: { name: string | null; email: string };
  folded: boolean;
  /** Absent in the overlay, which has nothing to fold. */
  onFold?: () => void;
}) {
  return (
    <>
      {onFold && (
        <div
          className={`mb-7 flex items-center ${folded ? "justify-center" : "justify-between px-2"}`}
        >
          {!folded && (
            <Link href="/" className="flex items-center">
              <PlannrLogo height={28} wordmarkSize={19} />
            </Link>
          )}
          <button
            type="button"
            onClick={onFold}
            aria-label={folded ? "Expand the sidebar" : "Fold the sidebar"}
            title={folded ? "Expand the sidebar" : "Fold the sidebar"}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px]"
            style={{ background: "rgba(68,88,121,0.07)" }}
          >
            <Icon
              name="panelFold"
              size={16}
              color="var(--slate)"
              className={folded ? "rotate-180" : undefined}
            />
          </button>
        </div>
      )}

      <div
        className={`mb-5 flex items-center gap-2.5 rounded-[10px] py-2.5 ${folded ? "justify-center px-0" : "px-3"}`}
        style={folded ? undefined : { boxShadow: "var(--ring)" }}
        title={folded ? orgName : undefined}
      >
        <span
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "color-mix(in srgb, var(--slate) 16%, #fff)" }}
        >
          <Icon name="building" size={16} color="var(--slate)" stroke={2} />
        </span>
        {!folded && (
          <span className="min-w-0">
            <span className="font-display text-title block truncate text-[13.5px] font-bold">
              {orgName}
            </span>
            <span className="text-muted block truncate text-[11px]">
              {roleNames.length > 0 ? roleNames.join(" · ") : "No role"}
            </span>
          </span>
        )}
      </div>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              // A folded rail has no label to read, so the name has to reach a
              // screen reader some other way.
              aria-label={folded ? item.label : undefined}
              title={folded ? item.label : undefined}
              className={`plr-clip flex items-center gap-2.5 rounded-[10px] py-2.5 text-[14px] font-semibold ${
                folded ? "justify-center px-0" : "px-3"
              }`}
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
              {!folded && item.label}
            </Link>
          );
        })}
      </nav>

      <div
        className={`mt-auto flex items-center gap-2.5 pt-4 ${folded ? "flex-col" : ""}`}
        style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
      >
        <span
          className="mt-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
          style={{ background: "var(--slate)" }}
          title={folded ? personName(user) : undefined}
        >
          {personName(user).charAt(0).toUpperCase()}
        </span>
        {!folded && (
          <span className="mt-4 min-w-0 flex-1">
            <span className="text-title block truncate text-[13px] font-semibold">
              {personName(user)}
            </span>
            <span className="text-faint block truncate text-[11px]">
              {contactAddress(user.email)}
            </span>
          </span>
        )}
        <Link
          href="/api/auth/signout"
          title="Sign out"
          aria-label="Sign out"
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${folded ? "" : "mt-4"}`}
        >
          <Icon name="logout" size={16} color="var(--faint)" />
        </Link>
      </div>
    </>
  );
}
