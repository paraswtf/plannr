/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLongPress } from "./use-long-press";

/**
 * The gesture, and the four ways it has to *not* fire.
 *
 * All of these are things that only go wrong on a real phone, at which point
 * they go wrong silently: a hold that also opens the drawer behind the modal, a
 * hold that fires while the reader was scrolling the day, a right-click that
 * opens twice because Android raised `contextmenu` after its own long press had
 * already been answered.
 *
 * Timers are faked throughout, because the hold is 450ms and a suite that
 * actually waited would be the slowest thing in the repo.
 */

const HOLD_MS = 450;

function Block({
  onPress,
  onClick,
}: {
  onPress?: () => void;
  onClick?: () => void;
}) {
  const press = useLongPress(onPress);
  return (
    <button type="button" onClick={onClick} {...press}>
      Data Structures
    </button>
  );
}

const block = () => screen.getByRole("button");

/** A touch pointerdown, which is the only kind that arms the timer. */
const touchDown = (x = 10, y = 10) =>
  fireEvent.pointerDown(block(), {
    pointerType: "touch",
    clientX: x,
    clientY: y,
  });

const touchMove = (x: number, y: number) =>
  fireEvent.pointerMove(block(), {
    pointerType: "touch",
    clientX: x,
    clientY: y,
  });

const hold = () => act(() => void vi.advanceTimersByTime(HOLD_MS));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("useLongPress", () => {
  it("fires once a finger has stayed put long enough", () => {
    const onPress = vi.fn();
    render(<Block onPress={onPress} />);
    touchDown();
    expect(onPress).not.toHaveBeenCalled();
    hold();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("swallows the click iOS fires after the hold", () => {
    // The failure this exists to stop: the drawer opening behind the modal.
    const onPress = vi.fn();
    const onClick = vi.fn();
    render(<Block onPress={onPress} onClick={onClick} />);
    touchDown();
    hold();
    fireEvent.pointerUp(block());
    fireEvent.click(block());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("still swallows it when the finger was held for a good while", () => {
    /*
     * The guard's deadline is set when the finger *lifts*, not when the press
     * fired. Measured from the firing it would have lapsed long before this
     * click arrived — and somebody who holds until they see something happen,
     * then a beat longer, is the ordinary case rather than the awkward one.
     */
    const onPress = vi.fn();
    const onClick = vi.fn();
    render(<Block onPress={onPress} onClick={onClick} />);
    touchDown();
    hold();
    act(() => void vi.advanceTimersByTime(2_500));
    fireEvent.pointerUp(block());
    fireEvent.click(block());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("eats the click wherever it lands, not only on the block", () => {
    /*
     * By the time the finger lifts, the modal the press opened is painted over
     * the block, so the browser hit-tests the release against the scrim and the
     * click lands *there* — which would dismiss the modal the same gesture had
     * just opened. A guard on the block would never see it.
     */
    const onPress = vi.fn();
    const elsewhere = vi.fn();
    render(<Block onPress={onPress} />);
    document.addEventListener("click", elsewhere);
    try {
      touchDown();
      hold();
      fireEvent.pointerUp(block());
      fireEvent.click(document.body);
      expect(elsewhere).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("click", elsewhere);
    }
  });

  it("stands the guard down once the click it was waiting for has been eaten", () => {
    // One click, not every click: the next real tap must go through.
    const onPress = vi.fn();
    const onClick = vi.fn();
    render(<Block onPress={onPress} onClick={onClick} />);
    touchDown();
    hold();
    fireEvent.pointerUp(block());
    fireEvent.click(block());
    expect(onClick).not.toHaveBeenCalled();

    touchDown();
    act(() => void vi.advanceTimersByTime(120));
    fireEvent.pointerUp(block());
    fireEvent.click(block());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stands the guard down on its own when no click ever arrives", () => {
    // Android answers a long press with `contextmenu` and no click at all, so
    // a guard that only ever came down on a click would eat the next real one.
    const onPress = vi.fn();
    const onClick = vi.fn();
    render(<Block onPress={onPress} onClick={onClick} />);
    touchDown();
    hold();
    fireEvent.pointerUp(block());
    act(() => void vi.advanceTimersByTime(1_000));
    fireEvent.click(block());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("leaves an ordinary tap's click alone", () => {
    const onPress = vi.fn();
    const onClick = vi.fn();
    render(<Block onPress={onPress} onClick={onClick} />);
    touchDown();
    act(() => void vi.advanceTimersByTime(120));
    fireEvent.pointerUp(block());
    fireEvent.click(block());
    expect(onPress).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("forgives a thumb's drift but not a drag", () => {
    const onPress = vi.fn();
    render(<Block onPress={onPress} />);
    touchDown(10, 10);
    // Inside the tolerance: a thumb resting on glass, not somebody moving.
    touchMove(14, 13);
    hold();
    expect(onPress).toHaveBeenCalledTimes(1);

    onPress.mockClear();
    touchDown(10, 10);
    touchMove(10, 40);
    hold();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("gives up the moment the browser claims the touch for a scroll", () => {
    const onPress = vi.fn();
    render(<Block onPress={onPress} />);
    touchDown();
    fireEvent.pointerCancel(block());
    hold();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("gives up when an ancestor scrolls under the finger", () => {
    // Belt and braces over pointercancel — this also catches a scroll begun by
    // a second finger, and a fling still coasting under the press.
    const onPress = vi.fn();
    render(<Block onPress={onPress} />);
    touchDown();
    fireEvent.scroll(document, {});
    hold();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("never arms for a pointer that can drag instead", () => {
    // A mouse and a pen both begin a block move on pointerdown, so neither may
    // also be running a hold timer. Both reach the same answer through
    // `contextmenu`, which a barrel button and Windows Ink already raise.
    for (const pointerType of ["mouse", "pen"]) {
      const onPress = vi.fn();
      render(<Block onPress={onPress} />);
      fireEvent.pointerDown(block(), { pointerType, clientX: 10, clientY: 10 });
      hold();
      expect(onPress, pointerType).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("answers a mouse through the context menu instead, and suppresses the browser's", () => {
    const onPress = vi.fn();
    render(<Block onPress={onPress} />);
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(block(), event);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("opens once when a hold and a context menu both arrive", () => {
    // Android's own long press raises `contextmenu` *after* the timer has
    // already answered. Opening twice is worse than the menu just suppressed.
    const onPress = vi.fn();
    render(<Block onPress={onPress} />);
    touchDown();
    hold();
    fireEvent.contextMenu(block());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all when there is no callback", () => {
    const onClick = vi.fn();
    render(<Block onClick={onClick} />);
    touchDown();
    hold();
    // The browser's own menu is left alone where we have nothing to put in its
    // place, and the click still goes through.
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(block(), event);
    expect(event.defaultPrevented).toBe(false);
    fireEvent.click(block());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
