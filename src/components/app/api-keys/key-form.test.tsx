/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent, {
  PointerEventsCheckLevel,
} from "@testing-library/user-event";
import { useEffect, useReducer } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bitsToScopes,
  scopeCatalog,
  scopeDenialMessage,
  scopesToBits,
} from "~/lib/api-scopes";
import { DEFAULT_TIMEZONE, formatFullDate } from "~/lib/dates";
import { PermissionFlags } from "~/lib/permissions";
import type { RouterInputs } from "~/trpc/react";
import { CreateKeyDialog } from "./create-key-dialog";
import { KeyDialog, type ApiKey } from "./key-dialog";
import {
  DEFAULT_EXPIRY,
  DEFAULT_RATE_LIMIT,
  draftIsValid,
  emptyDraft,
  expiryDate,
  expiryDays,
} from "./key-form";

/**
 * The fields a key is minted and edited with.
 *
 * `KeyFields` holds no mutation of its own, so half of what is worth asserting
 * about it is only visible through the two dialogs that host it — what the
 * draft turns into when the button is pressed, and what happens to the fields
 * while that press is in flight. Those are tested through `CreateKeyDialog` and
 * `KeyDialog` rather than through a stub host, because a stub host would be a
 * second implementation of the very mapping under test.
 *
 * Four properties are the reason this file exists:
 *
 *   - A key with no scopes is refused before it is sent, in the same sentence
 *     the server would have refused it with. `denyScopeGrant` is imported here
 *     rather than transcribed, so the two cannot drift apart quietly.
 *   - "Never" is an absent expiry, not a zero. A zero would be an expiry
 *     already in the past — a key born dead — and the mint's zod input would
 *     refuse it anyway, so the bug would surface as a confusing 400.
 *   - Editing sends back what it was handed. Scopes are the interesting case:
 *     `list` reports them expanded and the editor reduces them to a generating
 *     set, so "unchanged" means the same *effective* scopes, not the same
 *     array.
 *   - The whole form goes dead while a mint is in flight, because the failure
 *     mode of not doing that is two live credentials where somebody asked for
 *     one, only one of which they wrote down.
 *
 * tRPC is mocked at `~/trpc/react` with a mutation that behaves the way React
 * Query's does — it stays pending until the test lets it finish — since the
 * in-flight state is the point of half of these tests rather than an accident
 * of the harness.
 */

// The router's own input types, so a zod input that gains or loses a field
// stops this file compiling rather than letting an assertion go stale.
type CreateInput = RouterInputs["apiKeys"]["create"];
type UpdateInput = RouterInputs["apiKeys"]["update"];
type RollInput = RouterInputs["apiKeys"]["roll"];
type RevokeInput = RouterInputs["apiKeys"]["revoke"];
type DeleteInput = RouterInputs["apiKeys"]["delete"];

interface Handlers {
  onError?: (error: { message: string }) => unknown;
}

interface MutationSpy<TInput> {
  /** Every input handed to `mutate`, oldest first. */
  calls: TInput[];
  /** The most recent one, so an assertion does not have to index and narrow. */
  last: () => TInput;
  use: (opts?: Handlers) => {
    mutate: (input: TInput) => void;
    isPending: boolean;
    reset: () => void;
  };
  /** Let the pretend server refuse the call that is in flight. */
  fail: (message: string) => Promise<void>;
}

/**
 * A mutation that stays pending until somebody says otherwise.
 *
 * `isPending` lives outside React and every mounted consumer is nudged when it
 * moves, which is the one behaviour of `useMutation` these tests depend on. A
 * stub that reported `isPending: false` forever would make the double-press
 * test pass by construction.
 */
function mutationSpy<TInput>(): MutationSpy<TInput> {
  const calls: TInput[] = [];
  const consumers = new Set<() => void>();
  let pending = false;
  let handlers: Handlers = {};

  const nudge = () => {
    for (const consumer of consumers) consumer();
  };

  return {
    calls,
    last: () => {
      const input = calls.at(-1);
      if (!input) throw new Error("mutate was never called");
      return input;
    },
    use(opts) {
      handlers = opts ?? {};
      const [, bump] = useReducer((n: number) => n + 1, 0);
      useEffect(() => {
        consumers.add(bump);
        return () => {
          consumers.delete(bump);
        };
      }, [bump]);
      return {
        mutate: (input) => {
          calls.push(input);
          pending = true;
          nudge();
        },
        isPending: pending,
        reset: () => undefined,
      };
    },
    async fail(message) {
      await act(async () => {
        pending = false;
        nudge();
        await handlers.onError?.({ message });
      });
    },
  };
}

let trpc: {
  create: MutationSpy<CreateInput>;
  update: MutationSpy<UpdateInput>;
  roll: MutationSpy<RollInput>;
  revoke: MutationSpy<RevokeInput>;
  remove: MutationSpy<DeleteInput>;
};

// Read lazily — the factory is hoisted above everything below it, but nothing
// in it runs until a component actually calls a hook, by which time `trpc` is
// the set of spies this test was given.
vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      apiKeys: { list: { invalidate: () => Promise.resolve() } },
    }),
    apiKeys: {
      create: { useMutation: (opts?: Handlers) => trpc.create.use(opts) },
      update: { useMutation: (opts?: Handlers) => trpc.update.use(opts) },
      roll: { useMutation: (opts?: Handlers) => trpc.roll.use(opts) },
      revoke: { useMutation: (opts?: Handlers) => trpc.revoke.use(opts) },
      delete: { useMutation: (opts?: Handlers) => trpc.remove.use(opts) },
      usage: { useQuery: () => ({ data: undefined, error: null }) },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

/**
 * `Segmented` — the Details/Usage strip at the top of the edit dialog — nudges
 * the active pill into view on mount, and happy-dom implements `scrollTo` but
 * not `scrollBy`. Filled in as a no-op rather than guarded in the component:
 * there is nothing to scroll into view in a document with no layout, and the
 * app should not carry a check for a DOM that only exists in here. Not put
 * back afterwards, because the environment is this file's alone.
 */
Element.prototype.scrollBy = () => undefined;

/** The real vocabulary, so a scope added to the catalogue shows up here too. */
const catalog = scopeCatalog();

/** An administrator, who may grant anything a key is allowed to hold. */
const granter = String(PermissionFlags.Administrator);

/**
 * happy-dom has no layout, so every rect is zero and user-event's
 * pointer-events check refuses to click a portalled popover it believes is off
 * screen. Switched off rather than worked around: the thing it is guarding
 * against cannot be reproduced without a layout engine.
 */
const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

const existingKey = (over: Partial<ApiKey> = {}): ApiKey => ({
  id: "clxq7k2v10000356m9d0abcde",
  name: "Foyer room display",
  description: "The screen by the front door. Estates run it.",
  prefix: "k7f2h9",
  last4: "3c1a",
  // Expanded, the way `apiKeys.list` reports them: ticking "manage all events"
  // drags three narrower scopes in behind it.
  scopes: bitsToScopes(
    PermissionFlags.ManageAllEvents | PermissionFlags.ViewRooms,
  ),
  status: "active",
  createdBy: { id: "clxq7k2v10000356m9d0zzzzz", name: "Paras" },
  createdAt: new Date("2026-06-01T09:00:00Z"),
  expiresAt: new Date("2026-12-01T09:00:00Z"),
  revokedAt: null,
  lastUsedAt: new Date("2026-08-25T11:00:00Z"),
  requestCount: 1284,
  rateLimitPerMinute: 240,
  ...over,
});

const mintDialog = () =>
  render(
    <CreateKeyDialog
      catalog={catalog}
      granterPermissions={granter}
      onClose={vi.fn()}
      onMinted={vi.fn()}
    />,
  );

const editDialog = (apiKey: ApiKey) =>
  render(
    <KeyDialog
      apiKey={apiKey}
      catalog={catalog}
      granterPermissions={granter}
      onClose={vi.fn()}
      onRolled={vi.fn()}
    />,
  );

const nameField = () => screen.getByRole("textbox", { name: "Name" });
const purposeField = () =>
  screen.getByRole("textbox", { name: "What it is for" });
const rateField = () =>
  screen.getByRole("spinbutton", { name: "Rate limit, requests a minute" });
const expiryTrigger = () => screen.getByRole("button", { name: "Expires" });

/** Tick a scope by the words on its row, not by the flag behind it. */
const scopeBox = (label: string) =>
  screen.getByRole("checkbox", { name: new RegExp(`^${label}`) });

const chooseExpiry = async (
  user: ReturnType<typeof setup>,
  option: string | RegExp,
) => {
  await user.click(expiryTrigger());
  await user.click(screen.getByRole("option", { name: option }));
};

beforeEach(() => {
  trpc = {
    create: mutationSpy<CreateInput>(),
    update: mutationSpy<UpdateInput>(),
    roll: mutationSpy<RollInput>(),
    revoke: mutationSpy<RevokeInput>(),
    remove: mutationSpy<DeleteInput>(),
  };
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("what an expiry choice means", () => {
  it("distinguishes 'leave it alone' from 'never'", () => {
    // Three states, not two. `undefined` is the edit dialog declining to touch
    // the column at all; `null` is a deliberate "this one never lapses".
    expect(expiryDays("keep")).toBeUndefined();
    expect(expiryDays("never")).toBeNull();
    expect(expiryDate("keep")).toBeUndefined();
    expect(expiryDate("never")).toBeNull();
  });

  it("counts days rather than passing the string through", () => {
    expect(expiryDays("30")).toBe(30);
    expect(expiryDays("90")).toBe(90);
    expect(expiryDays("365")).toBe(365);
  });

  it("puts a dated expiry that many days out", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00Z"));
    expect(expiryDate("365")).toEqual(new Date("2027-08-25T12:00:00Z"));
    vi.useRealTimers();
  });

  it("defaults to a quarter, which is the point of offering the choice", () => {
    expect(emptyDraft().expiry).toBe(DEFAULT_EXPIRY);
    expect(expiryDays(DEFAULT_EXPIRY)).toBe(90);
  });
});

describe("what counts as a complete draft", () => {
  const draft = (over: Partial<ReturnType<typeof emptyDraft>> = {}) => ({
    ...emptyDraft(),
    name: "Foyer room display",
    scopes: ["ViewAllEvents" as const],
    ...over,
  });

  it("wants a name and at least one scope", () => {
    expect(draftIsValid(draft())).toBe(true);
    expect(draftIsValid(draft({ name: "   " }))).toBe(false);
    expect(draftIsValid(draft({ scopes: [] }))).toBe(false);
  });

  /**
   * The bounds are the router's, not this form's: `rateLimitPerMinute` is
   * `z.number().int().min(1).max(10_000)` in `~/server/api/routers/api-keys`.
   * A form that let 10,001 through would send a request the mint refuses, and
   * the person would read "Number must be less than or equal to 10000" instead
   * of seeing the button stay dark.
   */
  it("holds the throttle to the bounds the mint accepts", () => {
    expect(draftIsValid(draft({ rateLimit: "1" }))).toBe(true);
    expect(draftIsValid(draft({ rateLimit: "10000" }))).toBe(true);
    expect(draftIsValid(draft({ rateLimit: "0" }))).toBe(false);
    expect(draftIsValid(draft({ rateLimit: "-1" }))).toBe(false);
    expect(draftIsValid(draft({ rateLimit: "10001" }))).toBe(false);
  });

  it("refuses a throttle that is not a whole number of requests", () => {
    expect(draftIsValid(draft({ rateLimit: "12.5" }))).toBe(false);
    expect(draftIsValid(draft({ rateLimit: "" }))).toBe(false);
    expect(draftIsValid(draft({ rateLimit: "lots" }))).toBe(false);
  });

  it("starts at the database's own default", () => {
    expect(emptyDraft().rateLimit).toBe(String(DEFAULT_RATE_LIMIT));
    expect(draftIsValid(emptyDraft())).toBe(false);
  });
});

describe("minting a key", () => {
  it("refuses an empty grant in the words the server would have used", async () => {
    const user = setup();
    mintDialog();

    // The same sentence, imported rather than transcribed: this is the refusal
    // `denyScopeGrant` would come back with, arriving before the round trip
    // instead of after it.
    expect(
      screen.getByText(scopeDenialMessage({ reason: "EMPTY" })),
    ).toBeInTheDocument();

    await user.type(nameField(), "Foyer room display");

    const create = screen.getByRole("button", { name: "Create key" });
    expect(create).toBeDisabled();

    await user.click(create);
    expect(trpc.create.calls).toHaveLength(0);
  });

  it("stops saying so once a scope is ticked", async () => {
    const user = setup();
    mintDialog();

    await user.type(nameField(), "Foyer room display");
    await user.click(scopeBox("View all events"));

    expect(
      screen.queryByText(scopeDenialMessage({ reason: "EMPTY" })),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Create key" })).toBeEnabled();
  });

  it("offers no way to leave the expiry alone, because there is nothing to leave", async () => {
    const user = setup();
    mintDialog();

    await user.click(expiryTrigger());

    expect(
      screen.queryByRole("option", { name: /Leave unchanged/ }),
    ).toBeNull();
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      "30 days",
      "90 days",
      "365 days",
      "NeverNobody will be prompted to look at it again",
    ]);
  });

  it.each([
    ["30 days", 30],
    ["90 days", 90],
    ["365 days", 365],
  ])("sends %s as a count of days", async (option, days) => {
    const user = setup();
    mintDialog();

    await user.type(nameField(), "Foyer room display");
    await user.click(scopeBox("View all events"));
    await chooseExpiry(user, option);
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(trpc.create.last().expiresInDays).toBe(days);
  });

  it("sends no expiry at all for 'never', rather than a zero", async () => {
    const user = setup();
    mintDialog();

    await user.type(nameField(), "Foyer room display");
    await user.click(scopeBox("View all events"));
    await chooseExpiry(user, /^Never/);
    await user.click(screen.getByRole("button", { name: "Create key" }));

    const sent = trpc.create.last();
    // A zero would be an expiry already in the past — a key born dead — and
    // `expiresInDays` is `.min(1)` on the mint, so it would come back a 400
    // rather than a key that never lapses.
    expect(sent.expiresInDays).toBeUndefined();
    expect(sent.expiresInDays).not.toBe(0);
  });

  it("uses the ninety days it opened on when nobody touches the field", async () => {
    const user = setup();
    mintDialog();

    expect(expiryTrigger()).toHaveTextContent("90 days");

    await user.type(nameField(), "Foyer room display");
    await user.click(scopeBox("View all events"));
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(trpc.create.last().expiresInDays).toBe(Number(DEFAULT_EXPIRY));
  });

  it("sends the rest of the draft trimmed, and drops an empty description", async () => {
    const user = setup();
    mintDialog();

    await user.type(nameField(), "  Foyer room display  ");
    await user.click(scopeBox("View all events"));
    await user.click(screen.getByRole("button", { name: "Create key" }));

    expect(trpc.create.last()).toMatchObject({
      name: "Foyer room display",
      description: undefined,
      scopes: ["ViewAllEvents"],
      rateLimitPerMinute: DEFAULT_RATE_LIMIT,
    });
  });

  it("keeps the button dark for a throttle past the ceiling", async () => {
    const user = setup();
    mintDialog();

    await user.type(nameField(), "Foyer room display");
    await user.click(scopeBox("View all events"));

    await user.clear(rateField());
    await user.type(rateField(), "10001");
    expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();

    await user.clear(rateField());
    await user.type(rateField(), "10000");
    expect(screen.getByRole("button", { name: "Create key" })).toBeEnabled();

    await user.clear(rateField());
    await user.type(rateField(), "0");
    expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();
  });

  it("cannot be pressed twice into two credentials", async () => {
    const user = setup();
    mintDialog();

    await user.type(nameField(), "Foyer room display");
    await user.click(scopeBox("View all events"));

    const create = screen.getByRole("button", { name: "Create key" });
    await user.click(create);
    expect(trpc.create.calls).toHaveLength(1);

    // Everything the draft is made of goes dead with it, so a second press —
    // or an edit followed by one — cannot mint a key nobody wrote down.
    expect(create).toBeDisabled();
    expect(create).toHaveTextContent("Creating…");
    expect(nameField()).toBeDisabled();
    expect(purposeField()).toBeDisabled();
    expect(rateField()).toBeDisabled();
    expect(scopeBox("View all events")).toBeDisabled();

    await user.click(create);
    expect(trpc.create.calls).toHaveLength(1);
  });

  it("gives the form back when the mint is refused", async () => {
    const user = setup();
    mintDialog();

    await user.type(nameField(), "Foyer room display");
    await user.click(scopeBox("Manage all events"));
    await user.click(screen.getByRole("button", { name: "Create key" }));

    const refusal = scopeDenialMessage({
      reason: "NOT_HELD",
      scope: "ManageAllEvents",
    });
    await trpc.create.fail(refusal);

    // The disabling is tied to the flight, not a one-way door: a refusal that
    // left the fields dead would leave the person with a form they can read
    // and not correct.
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(refusal);
    expect(nameField()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create key" })).toBeEnabled();
  });
});

describe("editing a key", () => {
  it("arrives filled in from the key it was handed", async () => {
    const user = setup();
    const key = existingKey();
    editDialog(key);

    expect(nameField()).toHaveValue(key.name);
    expect(purposeField()).toHaveValue(key.description);
    expect(rateField()).toHaveValue(key.rateLimitPerMinute);

    // The expiry opens on "leave it alone" rather than silently re-dating a
    // key that was minted six months ago, and the choice says what leaving it
    // alone actually means.
    expect(expiryTrigger()).toHaveTextContent("Leave unchanged");
    await user.click(expiryTrigger());
    expect(
      screen.getByRole("option", { name: /Leave unchanged/ }),
    ).toHaveTextContent(
      `Expires ${formatFullDate(new Date("2026-12-01T09:00:00Z"), DEFAULT_TIMEZONE)}`,
    );

    // Ticked, whether granted outright or held by implication.
    expect(scopeBox("Manage all events")).toBeChecked();
    expect(scopeBox("View rooms")).toBeChecked();
    expect(scopeBox("View all events")).toBeChecked();
  });

  it("locks the scopes that are only held by implication", () => {
    editDialog(existingKey());

    // Unticking one would do nothing — `ManageAllEvents` puts it back — so the
    // box says where it came from and refuses the click.
    const implied = scopeBox("View all events");
    expect(implied).toBeDisabled();
    expect(implied).toHaveAccessibleName(/granted by Manage all events/);
    expect(scopeBox("Manage all events")).toBeEnabled();
  });

  it("saves an untouched form back as it found it", async () => {
    const user = setup();
    const key = existingKey();
    editDialog(key);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const sent = trpc.update.last();
    expect(sent).toMatchObject({
      id: key.id,
      name: key.name,
      description: key.description,
      rateLimitPerMinute: key.rateLimitPerMinute,
    });
    // Undefined, not null: null would clear the expiry on a key nobody asked
    // to make immortal.
    expect(sent.expiresAt).toBeUndefined();

    // The editor reduced the expanded list to the scopes actually granted, so
    // what goes back is shorter than what came in — and means exactly the same
    // thing, which is the property worth asserting.
    expect(sent.scopes).toEqual(["ManageAllEvents", "ViewRooms"]);
    expect(bitsToScopes(scopesToBits(sent.scopes ?? []))).toEqual(key.scopes);
  });

  it("only re-dates the expiry when somebody picks a new one", async () => {
    const user = setup();
    editDialog(existingKey());

    // A window rather than a frozen clock: user-event schedules its own
    // keystrokes on real timers, and a suite that faked them would sit there
    // until it timed out.
    const opened = Date.now();
    await chooseExpiry(user, "30 days");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const pressed = Date.now();

    const expiresAt = trpc.update.last().expiresAt;
    expect(expiresAt).toBeInstanceOf(Date);
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    expect(expiresAt?.getTime()).toBeGreaterThanOrEqual(opened + THIRTY_DAYS);
    expect(expiresAt?.getTime()).toBeLessThanOrEqual(pressed + THIRTY_DAYS);
  });

  it("clears the expiry with a null when the answer is 'never'", async () => {
    const user = setup();
    editDialog(existingKey());

    await chooseExpiry(user, /^Never/);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(trpc.update.last().expiresAt).toBeNull();
  });

  it("sends an emptied description as a null, so the column is actually cleared", async () => {
    const user = setup();
    editDialog(existingKey());

    await user.clear(purposeField());
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(trpc.update.last().description).toBeNull();
  });

  it("cannot be saved twice", async () => {
    const user = setup();
    editDialog(existingKey());

    const save = screen.getByRole("button", { name: "Save changes" });
    await user.click(save);
    expect(trpc.update.calls).toHaveLength(1);

    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Saving…");
    expect(nameField()).toBeDisabled();

    await user.click(save);
    expect(trpc.update.calls).toHaveLength(1);
  });
});

/**
 * The gestures around the form.
 *
 * Not `controls`' doing, despite what the shape of this directory suggests:
 * `controls` only supplies the button and the two reds it is drawn in. The
 * decision that rolling, revoking and deleting each want a second, deliberate
 * press — and that saving does not — lives in `KeyDialog`, which is the form's
 * host, so it is asserted alongside the form it wraps.
 */
describe("which actions ask twice", () => {
  it("saves on the first press, because a save can be saved again", async () => {
    const user = setup();
    editDialog(existingKey());

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(trpc.update.calls).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Are you sure/ })).toBeNull();
  });

  it("asks before rolling, because the old token dies on the press", async () => {
    const user = setup();
    const key = existingKey();
    editDialog(key);

    await user.click(screen.getByRole("button", { name: "Roll the secret" }));
    expect(trpc.roll.calls).toHaveLength(0);
    expect(
      screen.getByRole("dialog", { name: "Roll this key?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Roll it" }));
    expect(trpc.roll.calls).toEqual([{ id: key.id }]);
  });

  it("asks before revoking, and takes no for an answer", async () => {
    const user = setup();
    const key = existingKey();
    editDialog(key);

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(trpc.revoke.calls).toHaveLength(0);
    expect(
      screen.getByRole("dialog", { name: /^Revoke .Foyer room display/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trpc.revoke.calls).toHaveLength(0);
    // Back on the form, not out of the dialog: Cancel here means "not that",
    // not "close the key".
    expect(nameField()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await user.click(screen.getByRole("button", { name: "Revoke the key" }));
    expect(trpc.revoke.calls).toEqual([{ id: key.id }]);
  });

  it("makes deleting be typed out in full", async () => {
    const user = setup();
    const key = existingKey({
      status: "revoked",
      revokedAt: new Date("2026-08-20T09:00:00Z"),
    });
    editDialog(key);

    // A revoked key is read-only, so the only thing left to do with the row is
    // the one thing that cannot be undone.
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Delete this key" }));
    expect(trpc.remove.calls).toHaveLength(0);

    const confirm = screen.getByRole("button", { name: "Delete for good" });
    expect(confirm).toBeDisabled();

    const typed = screen.getByRole("textbox", {
      name: `Type ${key.name} to confirm deletion`,
    });
    await user.type(typed, "Foyer room displa");
    expect(confirm).toBeDisabled();

    await user.type(typed, "y");
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(trpc.remove.calls).toEqual([{ id: key.id }]);
  });
});
