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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { scopeCatalog } from "~/lib/api-scopes";
import { PermissionFlags } from "~/lib/permissions";
import { KeyDialog } from "./key-dialog";
import type { ScopeCatalog } from "./scope-picker";

/**
 * The four things that can be done to a key, and the gate in front of each.
 *
 * The router refuses to edit, roll or revoke a key that is already revoked, and
 * it deletes one without a second thought — so every guard a person actually
 * meets is drawn here, and only here. That makes this file the test of the
 * guards themselves: a delete that appeared next to an active key, or a revoke
 * that fired on the first press, would be a one-click loss of an integration
 * or of a term's worth of "who scheduled this?".
 */

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("~/trpc/react", async () => ({
  api: (await import("./trpc-double")).apiDouble,
}));

const { apiKeyFixture, mutations, queries, resetTrpcDouble } =
  await import("./trpc-double");

const CATALOG: ScopeCatalog = scopeCatalog();
const ADMIN = String(PermissionFlags.Administrator);

const active = () =>
  apiKeyFixture({ name: "Foyer room display", status: "active" });

const revoked = () =>
  apiKeyFixture({
    name: "Ghost importer",
    status: "revoked",
    revokedAt: new Date("2026-04-01T00:00:00.000Z"),
  });

function open(apiKey: ReturnType<typeof apiKeyFixture>) {
  const onClose = vi.fn();
  const onRolled = vi.fn();
  const user = userEvent.setup();
  render(
    <KeyDialog
      apiKey={apiKey}
      catalog={CATALOG}
      granterPermissions={ADMIN}
      onClose={onClose}
      onRolled={onRolled}
    />,
  );
  return { user, onClose, onRolled, apiKey };
}

/**
 * `Segmented` keeps the chosen tab on screen with `scrollBy`, which happy-dom
 * does not implement. That is a gap in the test DOM rather than a fault in the
 * component — every browser has it, and there is nothing to scroll in a
 * document with no layout — so it is filled here instead of being designed
 * around upstairs.
 */
beforeAll(() => {
  if (!("scrollBy" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollBy", {
      value: () => undefined,
      writable: true,
      configurable: true,
    });
  }
});

beforeEach(resetTrpcDouble);
afterEach(cleanup);

describe("KeyDialog", () => {
  it("offers an active key no way to delete it", () => {
    open(active());

    expect(
      screen.getByRole("button", { name: "Roll the secret" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    // Deletion is not a heavier revoke — it is the other side of a revoke, and
    // a live integration has no business being one press away from it.
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("offers a revoked key nothing to change, and deletion as the only thing left", () => {
    const key = revoked();
    open(key);

    expect(
      screen.getByRole("button", { name: "Delete this key" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Roll the secret" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revoke" }),
    ).not.toBeInTheDocument();
    // Read-only means read-only: the editor is not rendered disabled, it is
    // not rendered.
    expect(
      screen.queryByRole("textbox", { name: "Name" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    // The audit record is still legible — what it held, and when it stopped.
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    for (const scope of key.scopes) {
      const label = CATALOG.flatMap((g) => g.scopes).find(
        (s) => s.name === scope,
      )?.label;
      expect(screen.getByText(label ?? scope)).toBeInTheDocument();
    }
  });

  it("will not delete until the key's own name has been typed back", async () => {
    const key = revoked();
    const { user, onClose } = open(key);

    await user.click(screen.getByRole("button", { name: "Delete this key" }));

    const confirm = await screen.findByRole("dialog", { name: /^Delete / });
    const button = within(confirm).getByRole("button", {
      name: "Delete for good",
    });
    const field = within(confirm).getByRole("textbox", {
      name: `Type ${key.name} to confirm deletion`,
    });

    expect(button).toBeDisabled();

    await user.type(field, "Ghost");
    expect(button).toBeDisabled();
    expect(mutations.delete.calls).toHaveLength(0);

    await user.clear(field);
    await user.type(field, key.name);
    expect(button).toBeEnabled();

    await user.click(button);

    expect(mutations.delete.calls).toEqual([{ id: key.id }]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("does not revoke on the first press", async () => {
    const key = active();
    const { user } = open(key);

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    expect(mutations.revoke.calls).toHaveLength(0);
    const confirm = await screen.findByRole("dialog", { name: /^Revoke / });
    expect(
      within(confirm).getByText(/Revoking is a full stop, not a pause\./),
    ).toBeInTheDocument();

    await user.click(
      within(confirm).getByRole("button", { name: "Revoke the key" }),
    );

    expect(mutations.revoke.calls).toEqual([{ id: key.id }]);
  });

  it("backs out of a confirmation on Escape rather than taking the key with it", async () => {
    const key = active();
    const { user, onClose } = open(key);

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await screen.findByRole("dialog", { name: /^Revoke / });

    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(mutations.revoke.calls).toHaveLength(0);
    expect(
      await screen.findByRole("dialog", { name: key.name }),
    ).toBeInTheDocument();
  });

  it("does not roll on the first press, and hands the new token straight up", async () => {
    const key = active();
    const { user, onRolled } = open(key);

    mutations.roll.result = {
      ...key,
      token: "plk_live_7fa3c1.aFrEsHsEcReTnObOdYhAsSeEnYeT9d2b",
    };

    await user.click(screen.getByRole("button", { name: "Roll the secret" }));
    expect(mutations.roll.calls).toHaveLength(0);

    const confirm = await screen.findByRole("dialog", { name: /^Roll / });
    await user.click(within(confirm).getByRole("button", { name: "Roll it" }));

    expect(mutations.roll.calls).toEqual([{ id: key.id }]);
    // Wiped before it is passed on, so the plaintext never outlives the dialog
    // that is allowed to show it by sitting in the mutation cache.
    expect(mutations.roll.reset).toHaveBeenCalled();
    expect(onRolled).toHaveBeenCalledWith({
      name: key.name,
      token: "plk_live_7fa3c1.aFrEsHsEcReTnObOdYhAsSeEnYeT9d2b",
    });
  });

  it("saves the editor's own draft, not the row it was opened from", async () => {
    const key = active();
    const { user, onClose } = open(key);

    mutations.update.result = { ...key, name: "Foyer display (v2)" };

    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Foyer display (v2)");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mutations.update.calls).toEqual([
      {
        id: key.id,
        name: "Foyer display (v2)",
        description: null,
        scopes: ["ViewAllEvents"],
        rateLimitPerMinute: 120,
        // "Leave unchanged" is the default for an existing key, and undefined
        // is how the router is told to keep its hands off the expiry.
        expiresAt: undefined,
      },
    ]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("reads the counters on the usage tab", async () => {
    queries.usage = {
      data: {
        requestCount: 4821,
        lastUsedAt: new Date("2026-08-25T07:00:00.000Z"),
        lastUsedIp: "10.0.0.9",
        eventsCreated: 37,
        rateLimit: {
          perMinute: 120,
          usedThisWindow: 3,
          remaining: 117,
          windowStartedAt: new Date("2026-08-25T07:00:00.000Z"),
          resetsInSeconds: 41,
        },
      },
      error: null,
    };
    const { user } = open(active());

    await user.click(screen.getByRole("radio", { name: "Usage" }));

    expect(await screen.findByText("4,821")).toBeInTheDocument();
    expect(screen.getByText("37")).toBeInTheDocument();
    expect(screen.getByText("3/120")).toBeInTheDocument();
    expect(screen.getByText(/from 10\.0\.0\.9/)).toBeInTheDocument();
    // Nothing on this tab can change the key.
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
  });
});
