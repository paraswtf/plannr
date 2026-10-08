/** @vitest-environment happy-dom */

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bitsToScopes, scopeCatalog } from "~/lib/api-scopes";
import { PermissionFlags } from "~/lib/permissions";
import { ApiKeysView } from "./api-keys-view";
import type { ScopeCatalog } from "./scope-picker";

/**
 * The list, and the one path through this screen that produces a credential.
 *
 * Two things are being checked. The first is that a row tells the truth about
 * the key behind it — what it can reach, what it is called, and whether it
 * still works — because everything an admin decides on this screen is decided
 * from the row. The second is the mint: a token exists in the browser for the
 * length of one dialog, and the test follows it from the mutation's answer to
 * the moment it is gone from the document.
 */

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("~/trpc/react", async () => ({
  api: (await import("./trpc-double")).apiDouble,
}));

const { apiKeyFixture, mutations, queries, invalidateList, resetTrpcDouble } =
  await import("./trpc-double");

const CATALOG: ScopeCatalog = scopeCatalog();
const ADMIN = String(PermissionFlags.Administrator);
const TOKEN = "plk_live_7fa3c1.sEcReThAlFnObOdYeLsEeVeRsEeS9d2b";

const view = (keys = [] as ReturnType<typeof apiKeyFixture>[]) =>
  render(
    <ApiKeysView initialKeys={keys} catalog={CATALOG} permissions={ADMIN} />,
  );

const setup = (keys?: ReturnType<typeof apiKeyFixture>[]) => ({
  user: userEvent.setup(),
  ...view(keys),
});

/** The rows, in the order they are drawn. A row is a button; so is "Create key". */
const rows = () =>
  screen
    .getAllByRole("button")
    .filter((button) => button.textContent?.includes("plk_live_"));

const rowFor = (name: string) =>
  screen.getByRole("button", { name: new RegExp(name) });

beforeEach(resetTrpcDouble);
afterEach(cleanup);

describe("ApiKeysView", () => {
  it("says nothing is minted rather than drawing an empty table", () => {
    view();

    expect(screen.getByText(/No keys yet\./)).toBeInTheDocument();
    expect(screen.getByText("none yet")).toBeInTheDocument();
  });

  it("draws a row from what it is given: name, handle, scopes and status", () => {
    view([
      apiKeyFixture({
        name: "Foyer room display",
        description: "The screen by the lifts",
        prefix: "7fa3c1",
        last4: "9d2b",
        scopes: bitsToScopes(
          PermissionFlags.ViewAllEvents | PermissionFlags.ViewRooms,
        ),
      }),
    ]);

    const row = rowFor("Foyer room display");
    expect(
      within(row).getByText("The screen by the lifts"),
    ).toBeInTheDocument();
    // The public half of the token, with the secret half plainly elided.
    expect(within(row).getByText("plk_live_7fa3c1.…9d2b")).toBeInTheDocument();
    expect(within(row).getByText("Active")).toBeInTheDocument();
    // Labelled the way the catalogue labels them, not by their internal names.
    expect(within(row).getByText("View all events")).toBeInTheDocument();
    expect(within(row).getByText("View rooms")).toBeInTheDocument();
    expect(within(row).queryByText("ViewAllEvents")).not.toBeInTheDocument();
    expect(within(row).getByText(/never used/)).toBeInTheDocument();
    expect(within(row).getByText(/never expires/)).toBeInTheDocument();
  });

  it("gives each state its own pill", () => {
    view([
      apiKeyFixture({ name: "Working key", status: "active" }),
      apiKeyFixture({
        name: "Lapsed key",
        status: "expired",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
      }),
      apiKeyFixture({
        name: "Switched-off key",
        status: "revoked",
        revokedAt: new Date("2026-04-01T00:00:00.000Z"),
      }),
    ]);

    expect(
      within(rowFor("Working key")).getByText("Active"),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Lapsed key")).getByText("Expired"),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Switched-off key")).getByText("Revoked"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 active of 3")).toBeInTheDocument();
  });

  it("keeps a revoked key on the list, sunk to the bottom and dimmed", () => {
    view([
      apiKeyFixture({
        name: "Ghost importer",
        status: "revoked",
        revokedAt: new Date("2026-04-01T00:00:00.000Z"),
        // Created last, so only the revocation can be what sinks it.
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      }),
      apiKeyFixture({
        name: "Foyer room display",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ]);

    const drawn = rows();
    expect(drawn).toHaveLength(2);
    // Still there — it is the audit record for everything it ever scheduled.
    expect(drawn[1]).toHaveTextContent("Ghost importer");
    expect(drawn[0]).toHaveTextContent("Foyer room display");

    expect(Number(drawn[1]!.style.opacity)).toBeLessThan(1);
    expect(Number(drawn[0]!.style.opacity)).toBe(1);
    // Dimmed, not hidden: the row still reads.
    expect(within(drawn[1]!).getByText(/· revoked/)).toBeInTheDocument();
  });

  it("shows four scope chips and counts the rest", () => {
    const key = apiKeyFixture({
      name: "Timetable robot",
      scopes: bitsToScopes(
        PermissionFlags.ManageAllEvents | PermissionFlags.MarkAttendance,
      ),
    });
    view([key]);

    const row = rowFor("Timetable robot");
    expect(key.scopes.length).toBeGreaterThan(4);
    expect(
      within(row).getByText(`+${key.scopes.length - 4} more`),
    ).toBeInTheDocument();
  });

  it("re-reads the list rather than trusting the page it was rendered with", () => {
    queries.keys = [apiKeyFixture({ name: "Minted a moment ago" })];
    view([apiKeyFixture({ name: "Stale server render" })]);

    expect(rowFor("Minted a moment ago")).toBeInTheDocument();
    expect(screen.queryByText("Stale server render")).not.toBeInTheDocument();
  });

  it("mints a key, shows the token once, and lets nothing of it survive the dialog", async () => {
    const minted = apiKeyFixture({ name: "Foyer room display" });
    mutations.create.result = { ...minted, token: TOKEN, shownOnce: true };

    const { user } = setup([]);

    await user.click(screen.getByRole("button", { name: "Create key" }));

    const form = await screen.findByRole("dialog", {
      name: "Create an API key",
    });
    await user.type(
      within(form).getByRole("textbox", { name: "Name" }),
      "Foyer room display",
    );
    await user.click(
      within(form).getByRole("checkbox", { name: /^View all events\b/ }),
    );
    await user.click(within(form).getByRole("button", { name: "Create key" }));

    expect(mutations.create.calls).toEqual([
      {
        name: "Foyer room display",
        description: undefined,
        scopes: ["ViewAllEvents"],
        // Ninety days is the default, and the default is the argument.
        expiresInDays: 90,
        rateLimitPerMinute: 120,
      },
    ]);
    // Wiped before it is handed on, or the plaintext would sit in React
    // Query's cache long after the dialog allowed to show it had gone.
    expect(mutations.create.reset).toHaveBeenCalled();
    expect(invalidateList).toHaveBeenCalled();

    const secret = await screen.findByRole("dialog", {
      name: "Copy this key now",
    });
    expect(within(secret).getByText(TOKEN)).toBeInTheDocument();
    // Shown alone: no editor behind it to click back to.
    expect(
      screen.queryByRole("dialog", { name: "Create an API key" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    await user.click(
      within(secret).getByRole("checkbox", {
        name: /stored this key somewhere safe/i,
      }),
    );
    await user.click(within(secret).getByRole("button", { name: "Done" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });

  it("will not mint a key that can do nothing", async () => {
    const { user } = setup([]);

    await user.click(screen.getByRole("button", { name: "Create key" }));
    const form = await screen.findByRole("dialog", {
      name: "Create an API key",
    });
    await user.type(
      within(form).getByRole("textbox", { name: "Name" }),
      "Scopeless",
    );

    expect(
      within(form).getByRole("button", { name: "Create key" }),
    ).toBeDisabled();
    expect(
      within(form).getByText(/A key needs at least one scope/),
    ).toBeInTheDocument();
    expect(mutations.create.calls).toHaveLength(0);
  });
});
