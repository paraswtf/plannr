/** @vitest-environment happy-dom */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  bitsToScopes,
  impliedScopes,
  scopeCatalog,
  type ScopeName,
} from "~/lib/api-scopes";
import { ALL_PERMISSIONS, PermissionFlags } from "~/lib/permissions";
import { ScopePicker, type ScopeCatalog } from "./scope-picker";

/**
 * What a key is allowed to do, and what the person ticking the boxes is told
 * about it.
 *
 * The rules under test are not this component's — they live in
 * `~/lib/api-scopes` and are checked again on the server — so the assertions
 * below read them from there rather than restating them. A test that hardcoded
 * "ManageAllEvents implies ViewAllEvents" would go on passing on the day
 * somebody adds a third implication the editor forgets to lock.
 */

const CATALOG: ScopeCatalog = scopeCatalog();

const LABELS = new Map(
  CATALOG.flatMap((group) =>
    group.scopes.map((scope) => [scope.name, scope.label] as const),
  ),
);

/**
 * A scope's checkbox, found by the label the catalogue gives it.
 *
 * Anchored at the start because the accessible name runs on into the scope's
 * description and, when the box is locked, the attribution for why — all of
 * which is deliberate, and none of which should decide whether a test can find
 * the control.
 */
const boxFor = (scope: ScopeName) =>
  screen.getByRole("checkbox", {
    name: new RegExp(`^${LABELS.get(scope) ?? scope}\\b`),
  });

/** Everything a full administrator holds, without the flag itself. */
const EVERY_GRANTABLE_BIT = ALL_PERMISSIONS & ~PermissionFlags.Administrator;

function Editor({
  catalog = CATALOG,
  granter = EVERY_GRANTABLE_BIT,
  initial = [],
}: {
  catalog?: ScopeCatalog;
  granter?: bigint;
  initial?: ScopeName[];
}) {
  const [value, setValue] = useState<ScopeName[]>(initial);
  return (
    <ScopePicker
      catalog={catalog}
      value={value}
      onChange={setValue}
      granterPermissions={String(granter)}
    />
  );
}

const setup = (ui: React.ReactElement) => ({
  user: userEvent.setup(),
  ...render(ui),
});

afterEach(cleanup);

describe("ScopePicker", () => {
  it("is not offered Administrator by the catalogue the server sends", () => {
    expect(
      CATALOG.flatMap((group) => group.scopes).map((s) => s.name),
    ).not.toContain("Administrator");
  });

  it("will not draw an Administrator checkbox, whatever catalogue it is handed", () => {
    render(
      <Editor
        catalog={[
          ...CATALOG,
          {
            category: "Organisation",
            scopes: [
              {
                name: "Administrator",
                label: "Administrator",
                description:
                  "Full access to everything, including future features.",
              },
            ],
          },
        ]}
      />,
    );

    expect(
      screen.queryAllByRole("checkbox", { name: /administrator/i }),
    ).toHaveLength(0);
    expect(screen.queryByText("Administrator")).not.toBeInTheDocument();
    // The scopes that can honestly be granted are all still there.
    expect(screen.getAllByRole("checkbox").length).toBe(LABELS.size);
  });

  it("ticks and locks every scope a broader one implies", async () => {
    const { user } = setup(<Editor />);

    const broad = boxFor("ManageAllEvents");
    expect(broad).not.toBeChecked();

    await user.click(broad);

    expect(broad).toBeChecked();
    // The one that was clicked stays clickable; only its consequences lock.
    expect(broad).toBeEnabled();

    const implied = impliedScopes(PermissionFlags.ManageAllEvents);
    expect(implied.length).toBeGreaterThan(0);
    for (const scope of implied) {
      expect(boxFor(scope), `${scope} should be ticked`).toBeChecked();
      expect(boxFor(scope), `${scope} should be locked`).toBeDisabled();
    }
  });

  it("names the scope responsible for a locked one, so the grant is legible", async () => {
    const { user } = setup(<Editor />);

    await user.click(boxFor("ManageAllEvents"));

    expect(boxFor("ViewAllEvents")).toHaveAccessibleName(
      /granted by Manage all events/,
    );
  });

  it("counts what is in force rather than what was clicked", async () => {
    const { user } = setup(<Editor />);

    expect(screen.getByText("none chosen")).toBeInTheDocument();

    await user.click(boxFor("ManageAllEvents"));

    const inForce = bitsToScopes(PermissionFlags.ManageAllEvents).length;
    expect(inForce).toBeGreaterThan(1);
    expect(screen.getByText(`${inForce} in force`)).toBeInTheDocument();
  });

  it("releases the implied scopes when the scope holding them is unticked", async () => {
    const { user } = setup(<Editor />);

    await user.click(boxFor("ManageAllEvents"));
    await user.click(boxFor("ManageAllEvents"));

    for (const scope of impliedScopes(PermissionFlags.ManageAllEvents)) {
      expect(boxFor(scope), `${scope} should be released`).not.toBeChecked();
      expect(boxFor(scope), `${scope} should be free again`).toBeEnabled();
    }
    expect(screen.getByText("none chosen")).toBeInTheDocument();
  });

  it("draws a scope the granter does not hold, but refuses to let it be ticked", () => {
    render(
      <Editor granter={EVERY_GRANTABLE_BIT & ~PermissionFlags.ManageRooms} />,
    );

    const withheld = boxFor("ManageRooms");
    expect(withheld).toBeInTheDocument();
    expect(withheld).toBeDisabled();
    expect(withheld).not.toBeChecked();
    expect(withheld).toHaveAccessibleName(
      /because you do not hold it yourself/,
    );
  });
});
