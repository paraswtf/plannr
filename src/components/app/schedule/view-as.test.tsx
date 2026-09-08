/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { toneFor, ViewAs, type ViewAsSubject } from "./view-as";

/**
 * The one control that answers "whose schedule am I looking at".
 *
 * It replaced two — a dropdown of your own angles, and a search box that only
 * existed once you had chosen "Someone else…" — so what is worth pinning is the
 * merge itself: that both kinds of thing are in one list, that either can be
 * starred, and that a starred one is a single tap away without opening
 * anything. Those are the three claims the change makes.
 */

const PERSPECTIVES: ViewAsSubject[] = [
  { kind: "perspective", subject: "student", name: "Student" },
  { kind: "perspective", subject: "coordinator", name: "Coordinator" },
];

const PEOPLE: ViewAsSubject[] = [
  {
    kind: "person",
    subject: "user-rao",
    name: "Dr Rao",
    hint: "Faculty · Computer Science",
  },
  { kind: "person", subject: "user-sharma", name: "A Sharma", hint: "Student" },
];

beforeAll(() => {
  // The popover measures its anchor to place itself; happy-dom reports zeroes,
  // which is fine — nothing here asserts on position.
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(cleanup);

function view(props: Partial<Parameters<typeof ViewAs>[0]> = {}) {
  const onPick = vi.fn();
  const onToggleFavourite = vi.fn();
  const onQueryChange = vi.fn();
  render(
    <ViewAs
      current={PERSPECTIVES[0]!}
      perspectives={PERSPECTIVES}
      people={PEOPLE}
      favourites={[]}
      total={PEOPLE.length}
      query=""
      onQueryChange={onQueryChange}
      onPick={onPick}
      onToggleFavourite={onToggleFavourite}
      {...props}
    />,
  );
  return { onPick, onToggleFavourite, onQueryChange };
}

/** Opens the list, which is behind the trigger showing what is on screen now. */
const openList = () => {
  fireEvent.click(screen.getByRole("button", { name: /Student/ }));
};

describe("the merged list", () => {
  it("offers perspectives and people together, angles first", () => {
    view();
    openList();

    const options = screen.getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Student"),
      expect.stringContaining("Coordinator"),
      expect.stringContaining("Dr Rao"),
      expect.stringContaining("A Sharma"),
    ]);
  });

  it("switches to either kind from the same list", () => {
    const { onPick } = view();
    openList();

    fireEvent.click(screen.getByText("Dr Rao"));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "person", subject: "user-rao" }),
    );

    openList();
    fireEvent.click(screen.getByText("Coordinator"));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "perspective", subject: "coordinator" }),
    );
  });

  it("filters the angles as you type, without a round trip", () => {
    // Four perspectives are already in hand; asking the server to narrow a list
    // that short would only make typing feel worse. The people half is searched
    // server side, which is what `onQueryChange` is for.
    const { onQueryChange } = view({ query: "coord" });
    openList();

    // Asserted through each row's own star control rather than by searching
    // the text: "Student" is also A Sharma's hint, and a text match would pass
    // whether or not the Student *angle* had been filtered out.
    expect(
      screen.getByRole("button", { name: "Star Coordinator" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Star Student" }),
    ).not.toBeInTheDocument();
    // The people rows are whatever the server sent for that query, untouched.
    expect(
      screen.getByRole("button", { name: "Star Dr Rao" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search perspectives/), {
      target: { value: "rao" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("rao");
  });

  it("marks what is on screen now", () => {
    view({ current: PEOPLE[0]! });
    fireEvent.click(screen.getByRole("button", { name: /Dr Rao/ }));

    const selected = screen
      .getAllByRole("option")
      .filter((o) => o.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("Dr Rao");
  });

  it("says how many more matched than it is showing", () => {
    view({ total: 240 });
    openList();
    expect(screen.getByText(/238 more/)).toBeInTheDocument();
  });
});

describe("starring", () => {
  it("stars either kind, and unstars what is already starred", () => {
    const { onToggleFavourite } = view({ favourites: [PERSPECTIVES[1]!] });
    openList();

    fireEvent.click(screen.getByRole("button", { name: "Star Dr Rao" }));
    expect(onToggleFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "person", subject: "user-rao" }),
      true,
    );

    // Already starred, so the same control takes it off again.
    fireEvent.click(screen.getByRole("button", { name: "Unstar Coordinator" }));
    expect(onToggleFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "coordinator" }),
      false,
    );
  });

  it("does not switch the screen when the star is what was tapped", () => {
    // The star sits inside the row, and a row that also switched would make
    // starring somebody a way to accidentally leave your own timetable.
    const { onPick, onToggleFavourite } = view();
    openList();

    fireEvent.click(screen.getByRole("button", { name: "Star Dr Rao" }));
    expect(onToggleFavourite).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("the favourites strip", () => {
  it("is not drawn at all until something is starred", () => {
    view();
    expect(
      screen.queryByRole("button", { name: /^View as/ }),
    ).not.toBeInTheDocument();
  });

  it("switches in one tap, without opening the list", () => {
    const { onPick } = view({ favourites: [PEOPLE[0]!, PERSPECTIVES[1]!] });

    const strip = screen.getAllByRole("button", { name: /^View as/ });
    expect(strip).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "View as Dr Rao" }));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "user-rao" }),
    );
    // No list was opened to do it.
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("shows initials for a person, so no photo has to be fetched", () => {
    // `searchPeople` answers with four fields and no picture — it is narrow on
    // purpose — and widening it so a toolbar could be prettier is the wrong
    // trade.
    view({ favourites: [PEOPLE[0]!] });
    const avatar = screen.getByRole("button", { name: "View as Dr Rao" });
    // "Dr" is a title rather than a name, so the initials come from Rao alone.
    expect(within(avatar).getByText("RA")).toBeInTheDocument();
  });

  it("marks the one that is currently on screen", () => {
    view({ current: PEOPLE[0]!, favourites: [PEOPLE[0]!, PERSPECTIVES[1]!] });
    expect(
      screen.getByRole("button", { name: "View as Dr Rao" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "View as Coordinator" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

describe("favourites in the list", () => {
  it("puts what is starred at the top, above your own angles", () => {
    // The star is how a favourite is taken back, and it used to be reachable
    // only wherever that name happened to fall in a directory of hundreds — so
    // unstarring somebody meant searching for them first, which is exactly what
    // starring them was for.
    view({ favourites: [PEOPLE[0]!, PERSPECTIVES[1]!] });
    openList();

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringContaining("Dr Rao"),
      expect.stringContaining("Coordinator"),
      expect.stringContaining("Student"),
      expect.stringContaining("A Sharma"),
    ]);
  });

  it("lists a starred name once, not twice", () => {
    // One name in two groups is two answers to whether it is starred, and two
    // stars to press to find out which.
    view({ favourites: [PEOPLE[0]!] });
    openList();

    expect(
      screen
        .getAllByRole("option")
        .filter((o) => o.textContent?.includes("Dr Rao")),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Star Dr Rao" })).toBeNull();
  });

  it("keeps a starred person the server found by something other than a name", () => {
    // The server searches names *and* PRNs; this component narrows favourites
    // by name. A starred student found by their number failed the name test in
    // the top group and the starred test in the people group, and disappeared
    // out of a search that had just found exactly them — "Nobody matches that."
    view({
      favourites: [PEOPLE[1]!],
      people: [PEOPLE[1]!],
      query: "23030121",
      total: 1,
    });
    openList();

    expect(screen.getByText("A Sharma")).toBeInTheDocument();
    expect(screen.queryByText(/nobody matches that/i)).toBeNull();
    // And wherever it fell back to, the star still tells the truth about it.
    expect(
      screen.getByRole("button", { name: "Unstar A Sharma" }),
    ).toBeInTheDocument();
  });

  it("says the same thing about a perspective whether or not it is starred", () => {
    // Same row, same list. A subtitle that changed as a side effect of
    // starring would be the control reporting on itself.
    view({ favourites: [PERSPECTIVES[1]!] });
    openList();

    const starredRow = screen
      .getAllByRole("option")
      .find((o) => o.textContent?.includes("Coordinator"));
    expect(starredRow).toHaveTextContent("you");
  });

  it("unstars from the top of the list, without searching first", () => {
    const { onToggleFavourite } = view({ favourites: [PEOPLE[0]!] });
    openList();

    fireEvent.click(screen.getByRole("button", { name: "Unstar Dr Rao" }));
    expect(onToggleFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "user-rao" }),
      false,
    );
  });
});

describe("going back to your own schedule", () => {
  const backwards = { name: /back to your own schedule/i };

  it("offers no way back when there is nowhere to come back from", () => {
    // A cross that undoes nothing is a control that has to be read before it
    // can be ignored. The screen decides; this only draws what it is given.
    view();
    expect(screen.queryByRole("button", backwards)).toBeNull();
  });

  it("goes back in one press once the screen is pointed elsewhere", () => {
    const onClear = vi.fn();
    view({ onClear, current: PEOPLE[0]! });

    fireEvent.click(screen.getByRole("button", backwards));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe("holding a favourite", () => {
  const hold = () =>
    fireEvent.contextMenu(
      screen.getByRole("button", { name: "View as Dr Rao" }),
    );

  it("says who it is, which two initials cannot", () => {
    // "AS" is two letters that several people in a college of this size share,
    // and the one place that has to be resolvable is where you decide whether
    // to keep them.
    view({ favourites: [PEOPLE[0]!] });
    hold();

    expect(screen.getByText("Faculty · Computer Science")).toBeInTheDocument();
  });

  it("takes the favourite off without moving the screen", () => {
    const { onPick, onToggleFavourite } = view({ favourites: [PEOPLE[0]!] });
    hold();

    fireEvent.click(
      screen.getByRole("button", { name: /remove from favourites/i }),
    );
    expect(onToggleFavourite).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "user-rao" }),
      false,
    );
    expect(onPick).not.toHaveBeenCalled();
  });

  it("switches to it from the inside, for whoever opened it to look", () => {
    const { onPick } = view({ favourites: [PEOPLE[0]!] });
    hold();

    fireEvent.click(
      screen.getByRole("button", { name: /view this schedule/i }),
    );
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "user-rao" }),
    );
  });
});

describe("the people search", () => {
  it("is held back until the list is opened", () => {
    // Every student loading their own timetable would otherwise pay for a
    // directory query they were never going to read.
    const onOpen = vi.fn();
    view({ onOpen });
    expect(onOpen).not.toHaveBeenCalled();

    openList();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("avatar colours", () => {
  /**
   * The point of a colour is that somebody learns it. "Rao is the green one"
   * is only worth anything if Rao stays green — across a reload, across another
   * device, and across starring a sixth colleague — so the tone is hashed from
   * the subject rather than handed out by position in the strip.
   */

  it("gives a subject the same tone every time", () => {
    const rao = { kind: "person" as const, subject: "user-rao" };
    expect(toneFor(rao)).toEqual(toneFor({ ...rao }));
  });

  it("does not repaint the strip when its order changes", () => {
    // The failure a colour-by-index strip has: unstar somebody near the front
    // and everybody behind them changes colour.
    const before = [PEOPLE[0]!, PEOPLE[1]!, PERSPECTIVES[0]!].map(toneFor);
    const after = [PEOPLE[1]!, PERSPECTIVES[0]!].map(toneFor);
    expect(after).toEqual([before[1], before[2]]);
  });

  it("spreads a realistic strip across more than one colour", () => {
    // Six tones and five or so favourites: they will not all differ, but a hash
    // that put a whole strip on one colour would be no better than none.
    const strip = [
      { kind: "perspective" as const, subject: "student" },
      { kind: "perspective" as const, subject: "coordinator" },
      { kind: "person" as const, subject: "cmsua1yeaaaaaaaaaaaaaaaaa" },
      { kind: "person" as const, subject: "cmsub2zfbbbbbbbbbbbbbbbbb" },
      { kind: "person" as const, subject: "cmsuc3agccccccccccccccccc" },
    ];
    const inks = new Set(strip.map((s) => toneFor(s).ink));
    expect(inks.size).toBeGreaterThanOrEqual(3);
  });

  it("always pairs a fill with an ink that is not the fill", () => {
    for (const option of [...PERSPECTIVES, ...PEOPLE]) {
      const tone = toneFor(option);
      expect(tone.fill).toMatch(/^rgba\(/);
      expect(tone.ink).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
