/** @vitest-environment happy-dom */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecretDialog } from "./secret-dialog";

/**
 * The one screen in the app that holds a credential.
 *
 * These are not tests of a dialog. They are tests of the promise the router
 * makes when it throws the plaintext away and keeps a digest: that the token
 * was shown, that it could be kept, and that it left no copy of itself behind
 * when it went. Everything below is one of those three, and a failure in any of
 * them is a leaked or a lost credential rather than a cosmetic regression.
 */

const TOKEN = "plk_live_7fa3c1.sEcReThAlFnObOdYeLsEeVeRsEeS9d2b";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const writeText = vi.fn(async () => undefined);

/**
 * `userEvent.setup()` installs a clipboard of its own, so ours is fitted after
 * it rather than before — otherwise the spy is the one that gets replaced.
 */
function setup(ui: React.ReactElement) {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return { user, ...render(ui) };
}

/**
 * What `ApiKeysView` does with the dialog, in miniature: it holds the token,
 * and closing drops it. Rendered rather than asserted on a bare `onClose` spy
 * because the interesting question is not whether the callback fired — it is
 * whether the token is still in the document afterwards.
 */
function Console({ token }: { token: string }) {
  const [secret, setSecret] = useState<string | null>(token);
  return secret ? (
    <SecretDialog
      name="Foyer room display"
      token={secret}
      rolled={false}
      onClose={() => setSecret(null)}
    />
  ) : (
    <p>Back on the key list.</p>
  );
}

const tick = () =>
  screen.getByRole("checkbox", { name: /stored this key somewhere safe/i });
const done = () => screen.getByRole("button", { name: "Done" });

beforeEach(() => {
  writeText.mockClear();
});

afterEach(cleanup);

describe("SecretDialog", () => {
  it("shows the token and offers a way to keep it", async () => {
    const { user } = setup(<Console token={TOKEN} />);

    const dialog = screen.getByRole("dialog", { name: "Copy this key now" });
    expect(within(dialog).getByText(TOKEN)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(TOKEN);
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();
  });

  it("stays open when the clipboard is unreachable, so the token can be read off the screen", async () => {
    writeText.mockRejectedValueOnce(new Error("not allowed"));
    const { user } = setup(<Console token={TOKEN} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(screen.getByText(TOKEN)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("refuses Escape, the X and a click on the scrim while the key is unacknowledged", async () => {
    const onClose = vi.fn();
    const { user } = setup(
      <SecretDialog
        name="Foyer room display"
        token={TOKEN}
        rolled={false}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Copy this key now" });
    const scrim = dialog.parentElement;
    expect(scrim).not.toBeNull();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(scrim!);

    expect(onClose).not.toHaveBeenCalled();
    expect(done()).toBeDisabled();
    expect(screen.getByText(TOKEN)).toBeInTheDocument();
    // Refusing silently would read as a broken button, so the box says why —
    // and says it somewhere a screen reader is told about.
    expect(screen.getByRole("alert")).toHaveTextContent(/Copy the key first/i);
  });

  it("closes only once somebody says they have stored the key", async () => {
    const onClose = vi.fn();
    const { user } = setup(
      <SecretDialog
        name="Foyer room display"
        token={TOKEN}
        rolled={false}
        onClose={onClose}
      />,
    );

    expect(done()).toBeDisabled();

    await user.click(tick());

    expect(tick()).toBeChecked();
    expect(done()).toBeEnabled();

    await user.click(done());

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("lets Escape close it once acknowledged — the tick is the gesture, not the button", async () => {
    const onClose = vi.fn();
    const { user } = setup(
      <SecretDialog
        name="Foyer room display"
        token={TOKEN}
        rolled={false}
        onClose={onClose}
      />,
    );

    await user.click(tick());
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("leaves no trace of the token in the document once it is closed", async () => {
    const { user } = setup(<Console token={TOKEN} />);

    await user.click(tick());
    await user.click(done());

    expect(
      await screen.findByText("Back on the key list."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(TOKEN)).not.toBeInTheDocument();
    // Not `queryByText` alone: that only searches what React still owns. The
    // whole document is checked because the failure this guards against is a
    // token stranded in a tree nobody is rendering any more.
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });

  it("says the old token is already dead when the secret is a roll", () => {
    setup(
      <SecretDialog
        name="Foyer room display"
        token={TOKEN}
        rolled
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Your new key" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/previous key for this integration stopped working/i),
    ).toBeInTheDocument();
  });
});
