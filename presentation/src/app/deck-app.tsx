"use client";

import { Deck } from "~/deck/Deck";
import { Presenter } from "~/deck/Presenter";
import { SLIDES } from "~/sections";

/*
 * The slides are functions, so they cannot cross from a server component to
 * the client as props. These two thin client entries import them directly.
 */

export function DeckApp() {
  return <Deck slides={SLIDES} />;
}

export function PresenterApp() {
  return <Presenter slides={SLIDES} />;
}
