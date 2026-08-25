/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Button,
  Field,
  Notice,
  relativeTime,
  TextInput,
  tokenHandle,
} from "./controls";

/**
 * The vocabulary the API-key console is written in.
 *
 * `controls` owns no screen of its own — it is the twenty-odd buttons, the
 * fields and the two notices that the five dialogs share — so what is worth
 * asserting is the contract each of them makes with the screens above. Four of
 * those are load-bearing:
 *
 *   - Every button is `type="button"`. These live inside dialogs, and one that
 *     defaulted to `submit` would post the page the moment somebody pressed
 *     Enter in the name field.
 *   - `danger` and `destructive` are not two names for red. Rolling a key can
 *     be undone by rolling it again; revoking one cannot be undone at all, and
 *     the only warning between the two is that the second is filled.
 *   - A disabled button is disabled to the DOM, not merely dimmed. Every
 *     "a double press cannot mint two credentials" guarantee upstairs rests on
 *     that attribute rather than on the opacity beside it.
 *   - `tokenHandle` prints a token with its secret half gone. It is the one
 *     function here that would be a disclosure if it were wrong.
 *
 * Deliberately not tested: the exact paddings and radii. They are the same
 * values the rest of the app uses, and pinning them would turn a restyle into
 * a broken suite without ever catching a bug.
 */

afterEach(cleanup);

describe("Button", () => {
  it("is a plain button, and says what it does", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="destructive" icon="trash" onClick={onClick}>
        Delete for good
      </Button>,
    );

    // Found by the words on it, which is how every test in this directory
    // reaches a control and how a screen reader announces one.
    const button = screen.getByRole("button", { name: "Delete for good" });
    // Not `submit`: the confirmations these sit in are dialogs, not forms.
    expect(button).toHaveAttribute("type", "button");

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps the icon out of the name it is found by", () => {
    render(
      <Button icon="rotate" onClick={() => undefined}>
        Roll the secret
      </Button>,
    );

    // `Icon` is `aria-hidden`, so the accessible name is the words alone —
    // otherwise every assertion in this directory would be matching on the
    // shape of an SVG.
    expect(
      screen.getByRole("button", { name: "Roll the secret" }),
    ).toBeInTheDocument();
  });

  it("refuses the click when disabled, rather than only looking as if it does", async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Create key
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Create key" });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("draws the irreversible action differently from the recoverable one", () => {
    render(
      <>
        <Button variant="danger" onClick={() => undefined}>
          Revoke
        </Button>
        <Button variant="destructive" onClick={() => undefined}>
          Delete for good
        </Button>
      </>,
    );

    const danger = screen
      .getByRole("button", { name: "Revoke" })
      .getAttribute("style");
    const destructive = screen
      .getByRole("button", { name: "Delete for good" })
      .getAttribute("style");

    // The one that cannot be taken back is filled; the one that only threatens
    // a single key is outlined and merely tinted. This is the whole of the
    // warning a person gets before the gesture, so it is asserted rather than
    // left to the eye.
    expect(destructive).toContain("background: var(--red)");
    expect(danger).not.toContain("background:");
    expect(danger).toContain("color: var(--red)");
  });
});

describe("Field", () => {
  it("states the label and the sentence under it", () => {
    render(
      <Field label="Rate limit" hint="Requests a minute, 1–10,000.">
        <TextInput value="120" onChange={() => undefined} />
      </Field>,
    );

    expect(screen.getByText("Rate limit")).toBeInTheDocument();
    expect(
      screen.getByText("Requests a minute, 1–10,000."),
    ).toBeInTheDocument();
  });

  /**
   * A known gap, pinned rather than shrugged at.
   *
   * `Field` draws its label as a `<span>`, so nothing ties the words to the
   * control beneath them: a screen reader reads "edit text, blank" and the
   * label is just some prose that happened to come before it. Every call site
   * therefore has to name its own control, which is what `key-form` now does
   * for all four of its fields — but a caller who forgets gets no warning.
   *
   * The fix is for `Field` to render a `<label>` (as `DeleteConfirmation` in
   * `key-dialog` already does with the same markup) or to hand a generated id
   * down. Left alone here because `Field` is shared with dialogs another pass
   * is testing; when somebody does it, this test starts passing and vitest
   * will say so.
   */
  it.fails("names the control it wraps", () => {
    render(
      <Field label="Rate limit">
        <TextInput value="120" onChange={() => undefined} />
      </Field>,
    );

    expect(screen.getByRole("textbox", { name: "Rate limit" })).toHaveValue(
      "120",
    );
  });
});

describe("TextInput", () => {
  it("reports the text rather than the event", async () => {
    const onChange = vi.fn();
    render(
      <TextInput
        value=""
        onChange={onChange}
        ariaLabel="Name"
        placeholder="e.g. Foyer room display"
      />,
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Foy");

    // A controlled input whose value never moves, so each keystroke arrives on
    // its own — what matters is that the caller is handed a string.
    expect(onChange.mock.calls).toEqual([["F"], ["o"], ["y"]]);
  });

  it("stops at the length the column allows", async () => {
    const onChange = vi.fn();
    render(
      <TextInput
        value="abcd"
        onChange={onChange}
        ariaLabel="Name"
        maxLength={4}
      />,
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "e");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("takes nothing while disabled", async () => {
    const onChange = vi.fn();
    render(
      <TextInput value="" onChange={onChange} ariaLabel="Name" disabled />,
    );

    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input).toBeDisabled();

    await userEvent.type(input, "Foyer");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Notice", () => {
  it("colours the warning by how final it is", () => {
    const { container: red } = render(
      <Notice tone="red">Revoking is a full stop, not a pause.</Notice>,
    );
    const redBox = red.firstElementChild;
    cleanup();

    const { container: orange } = render(
      <Notice tone="orange">The current token stops working.</Notice>,
    );
    const orangeBox = orange.firstElementChild;

    expect(redBox?.getAttribute("style")).toContain("var(--red)");
    expect(orangeBox?.getAttribute("style")).toContain("var(--orange)");
  });

  it("says the sentence it was given", () => {
    render(
      <Notice tone="red">
        This erases the key, its service principal, and the record of everything
        it did.
      </Notice>,
    );

    expect(
      screen.getByText(/This erases the key, its service principal/),
    ).toBeInTheDocument();
  });
});

describe("tokenHandle", () => {
  it("prints the public half and elides the secret one", () => {
    // The dot is real: it is where the handle ends and the secret begins, so
    // what is shown is a token with its second half removed rather than a
    // decoration that happens to look like one.
    expect(tokenHandle("k7f2h9", "3c1a")).toBe("plk_live_k7f2h9.…3c1a");
  });

  it("never has more of the secret than the four characters it was handed", () => {
    const secret = "9f21c07b4ae6d3558812";
    const handle = tokenHandle("k7f2h9", secret.slice(-4));

    expect(handle).not.toContain(secret);
    expect(handle).toMatch(/^plk_live_[a-z0-9]+\.…[a-z0-9]{4}$/);
  });
});

describe("relativeTime", () => {
  const at = (msAgo: number) => {
    // A fixed clock, because every answer below is a distance from "now" and a
    // suite that read the wall clock would be a suite that fails at midnight.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00Z"));
    const result = relativeTime(new Date(Date.now() - msAgo));
    vi.useRealTimers();
    return result;
  };

  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it("says nothing precise about the last minute", () => {
    expect(at(0)).toBe("just now");
    expect(at(29 * 1000)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(at(MINUTE)).toBe("1 minute ago");
    expect(at(2 * MINUTE)).toBe("2 minutes ago");
    expect(at(59 * MINUTE)).toBe("59 minutes ago");
    expect(at(HOUR)).toBe("1 hour ago");
    expect(at(5 * HOUR)).toBe("5 hours ago");
    expect(at(DAY)).toBe("1 day ago");
    expect(at(29 * DAY)).toBe("29 days ago");
  });

  it("gives up on days at a month and on months at a year and a half", () => {
    expect(at(30 * DAY)).toBe("1 month ago");
    expect(at(510 * DAY)).toBe("17 months ago");
    expect(at(730 * DAY)).toBe("2 years ago");
  });

  it("gets the singular right, which is the half of this anybody notices", () => {
    expect(at(MINUTE)).not.toContain("minutes");
    expect(at(HOUR)).not.toContain("hours");
    expect(at(DAY)).not.toContain("days");
    expect(at(30 * DAY)).not.toContain("months");
  });
});
