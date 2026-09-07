import { type RouteDef } from "../types";

/**
 * The endpoints a phone talks to.
 *
 * Four GETs that each answer with one field, `speech`, holding a sentence meant
 * to be read out. That is a deliberately poor API shape and an excellent
 * Shortcut shape: Get Contents of URL, Get Dictionary Value, Speak Text, and
 * there is nothing left to configure. Anything wanting the underlying data
 * should read the caller's own timetable through the app rather than parsing
 * English back apart.
 *
 * `actor: "person"` rather than `"session"`, and the distinction is the whole
 * reason these work at all. A service key has no timetable, so "my next class"
 * is meaningless to it and it is refused. A *personal* key is somebody — it
 * carries their id, and its authority is the intersection of its scopes with
 * what that person holds at the moment of asking — so the question is
 * well-defined, and this is the one place in the API where that matters.
 *
 * `ViewOwnEvents` throughout, because it is what the procedures need and what a
 * personal key is given. Nothing here can reach another person's day: the
 * queries are built from the caller's own memberships and nothing in the
 * request names anybody.
 */
export const siriRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/siri/next-class",
    procedure: "siri.nextClass",
    summary: "Say what is on next, out loud",
    description:
      'A sentence naming the next class the caller has, whether that is later today, tomorrow or a named day further out — and what they are sitting in right now, if anything. Takes no day: "next" is the question. Unlike the schedule screen, a lecture that has finished is not the next one, so this does not apply the half-hour grace that keeps the screen on a day somebody has just walked out of.',
    tag: "Siri",
    scopes: ["ViewOwnEvents"],
    actor: "person",
  },
  {
    method: "GET",
    path: "/siri/day-start",
    procedure: "siri.dayStart",
    summary: "Say when the day starts, out loud",
    description:
      'When the caller\'s first class begins on a given day, and what it is. `day` is forgiving on purpose, because it is typed on a phone: "today", "tomorrow", a weekday like "monday" or "tue" — which means the next one, today included, where "next monday" means the one after — or a date as `YYYY-MM-DD`. Left out, it means today. A day word that cannot be read is answered with a sentence saying so rather than a 400, because a Shortcut hears an HTTP error as silence.',
    tag: "Siri",
    scopes: ["ViewOwnEvents"],
    actor: "person",
  },
  {
    method: "GET",
    path: "/siri/timings",
    procedure: "siri.timings",
    summary: "Say the college hours for a day, with the breaks, out loud",
    description:
      "How long the caller is in college on a given day and what the gaps in it are: \"you're in college from 9am to 6pm tomorrow, with a two hour break from 12:30pm to 2:30pm\". Derived from their own classes rather than from the institution's booking hours, which are the same for everybody and say nothing about anyone's day. Back-to-back sittings merge into one stretch, and only a gap of half an hour or more is called a break — below that you are changing rooms. Takes the same `day` as `/siri/day-start`.",
    tag: "Siri",
    scopes: ["ViewOwnEvents"],
    actor: "person",
  },
  {
    method: "GET",
    path: "/siri/any-classes",
    procedure: "siri.anyClasses",
    summary: "Say whether there is anything on, out loud",
    description:
      'Answers "do I have any classes today?" as a yes or a no first, then how many, the first one and when the last finishes. Says so in the past tense once the day is over. Takes the same `day` as `/siri/day-start`.',
    tag: "Siri",
    scopes: ["ViewOwnEvents"],
    actor: "person",
  },
];
