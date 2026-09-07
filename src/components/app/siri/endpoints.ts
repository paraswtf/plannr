/**
 * The four things a phone can be taught to ask, and what to call each shortcut.
 *
 * Kept apart from the screen because it is a list of facts rather than markup:
 * the paths have to match `src/server/rest/routes/siri.ts` exactly, and the
 * specimen answers have to match what `src/lib/siri-answers.ts` actually says.
 * A test asserts both, which is the only way a printed instruction stays true
 * after somebody renames an endpoint.
 */

export interface SiriEndpoint {
  /** Path under /api/v1, as declared in the REST registry. */
  path: string;
  /** What to name the shortcut, which becomes what you say to Siri. */
  phrase: string;
  /** What the shortcut answers. */
  blurb: string;
  /**
   * The day this shortcut asks about, spelled into its URL — and the day its
   * `phrase` above must therefore be about. Null for the one that takes none.
   */
  day: "today" | "tomorrow" | null;
  /** A real answer, so somebody can hear what they are about to build. */
  specimen: string;
}

export const SIRI_ENDPOINTS: SiriEndpoint[] = [
  {
    path: "/siri/next-class",
    phrase: "Next lecture",
    blurb: "What is on next, whether that is later today or a day from now.",
    day: null,
    specimen:
      "Your next class is tomorrow, Design Thinking at 9am, in room 4 0 3.",
  },
  {
    path: "/siri/day-start",
    phrase: "When does my day start tomorrow",
    blurb: "When the first class begins, and what it is.",
    day: "tomorrow",
    specimen:
      "Your day starts at 9am tomorrow, with Design Thinking at 9am, in room 4 0 3.",
  },
  {
    path: "/siri/timings",
    phrase: "College timings today",
    blurb: "How long you are in for, and the breaks in the middle.",
    day: "today",
    specimen:
      "You're in college from 9am to 6pm today, with a two hour break from 12:30pm to 2:30pm.",
  },
  {
    path: "/siri/any-classes",
    phrase: "Do I have class tomorrow",
    blurb: "Whether there is anything on at all, and roughly what.",
    day: "tomorrow",
    specimen:
      "Yes, three classes tomorrow. First is Design Thinking at 9am, in room 4 0 3, and the last finishes at 4pm.",
  },
];

/**
 * The full URL to type into a Shortcut.
 *
 * The day is spelled out rather than left to be discovered, because a URL you
 * can paste unedited is most of the difference between this being set up and
 * not — and it is the day the shortcut's own printed name says, so that what
 * somebody asks for and what they get cannot disagree. A test holds those two
 * together.
 */
export function siriUrl(origin: string, endpoint: SiriEndpoint): string {
  const base = `${origin.replace(/\/+$/, "")}/api/v1${endpoint.path}`;
  return endpoint.day ? `${base}?day=${endpoint.day}` : base;
}
