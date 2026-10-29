# Presenting Plannr: the deck

The design thinking presentation for Plannr, built as a small web app on the
same stack as Plannr itself: Next.js (App Router), TypeScript, Tailwind v4 and
Plannr's own fonts and mark. Every animation is GSAP, and slides change with
**morph transitions** (Keynote's Magic Move, built on GSAP Flip): anything that
appears on two slides in a row travels from one to the other.

The look is a light keynote with one accent colour. **[DESIGN.md](DESIGN.md)**
has the rules every slide follows (read it before designing a new slide); they
come from the three design skills in `.agents/skills/`.

It is a separate app from Plannr (its own `package.json`, its own build), so
nothing here touches the product.

## Running it

```bash
cd presentation
npm install
npm run dev          # http://localhost:3001  (Plannr keeps 3000)
```

To present from a production build, which works offline too:

```bash
npm run build
npm start            # http://localhost:3001
```

It needs a server for its lock (below), so it is no longer a static export:
host it where Next runs, such as Vercel with the root directory set to
`presentation`, or `npm start` on the presenting laptop.

## Locking the deck

The deck sits behind a six-digit code from an authenticator app (Google
Authenticator, Authy, 1Password…). Set it up once:

```bash
npm run lock:setup   # saves a secret in .env.local and shows its QR code
```

Scan the QR into the app. From then on every browser asks for the app's
current code once, and stays unlocked after. Run the command again to see the
same QR for another phone, or with `-- --rotate` for a new secret, which locks
every browser again. Without a secret, `npm run dev` leaves the deck open, and
a production server (`npm start`, or a host) keeps it shut and says the secret
is missing.

It is checked on the server, and the secret never leaves it. The middleware
(`src/middleware.ts`) sends every page to `/unlock` and answers every other
file, the deck's JavaScript and pictures included, with 401 until the browser
has the cookie that `/api/unlock` gives for a matching code. The cookie is
httpOnly, derived from the secret (so it gives nothing of it away) and renewed
on every visit. Only the unlock page's own needs are open: the page, its
stylesheets, its fonts and the mark.

Eight wrong codes from one address, or forty from everyone, in fifteen minutes,
and the form makes people wait. A browser that is already unlocked never
notices, so unlock the laptop you present from beforehand: someone sending
wrong codes on purpose can keep the form waiting. A code opens the deck once,
so one seen on a projected screen is already spent. The server keeps both in
memory. There is no database: the secret lives in `.env.local`, which git
ignores. For a hosted copy, set `DECK_TOTP_SECRET` in the host's environment
and redeploy. `npm run snapshot` lets itself in from `.env.local`. The code is
in `src/lock/`, `src/middleware.ts` and `src/app/unlock/`.

It holds on `npm start` and on Vercel, which runs the middleware before its
cache. To check a copy, open it in a private window: the unlock page's network
panel should show the deck's scripts answering 401. Don't put a caching proxy
in front of `npm start`, or it may hand one unlocked browser's files to
everyone. `npm run dev` answers this computer only (`-H 127.0.0.1`), because a
dev server also serves source maps of the deck that the middleware never sees;
`npm run dev -- -H 0.0.0.0` opens it to the network, slides and all.

## Presenting

| Key | Does |
| --- | --- |
| `→` `Space` `PgDn` `Enter` | Next build, then the next slide (clickers send PgDn) |
| `←` `PgUp` `Backspace` | Back a build — going back into a slide lands on its last build |
| `⇧→` / `⇧←` | Skip a slide's builds |
| `Home` / `End` | First / last slide |
| `O` or `Esc` | Overview: every slide, by section — click one to jump |
| `N` | Speaker notes under the slide, for rehearsing on one screen |
| `P` | Presenter view in a second window |
| `F` | Full screen |
| `B` | Black the screen out |
| `H` | Hide the placeholder marks |
| `M` | Reduced motion on or off (slides dissolve, builds land at once) |
| `?` | The list of keys |

**Presenter view.** Press `P` and drag the new window to your laptop screen; put
the deck on the projector and press `F` there. The presenter window shows the
slide on screen, the next build or slide, the script for the current build, the
time for the whole talk and for the current speaker, and who to hand over to.
Its arrow keys and buttons drive the deck. It also opens on its own at
`/presenter` for rehearsing.

The URL always names the slide (`/#students-ranking/2`), so a refresh lands
where you were.

## Who edits what

Each section of the talk is one file in `src/sections/`, owned by whoever
presents it:

| File | Section | Presenter |
| --- | --- | --- |
| `opening.tsx` | The project: the timetable today | Paras |
| `approach.tsx` | Our approach, who we heard from, the Apple quote, our scope, hand-over | Paras |
| `students.tsx` | Students | Sonal |
| `faculty.tsx` | Faculty (internal and visiting) | Ravya |
| `coordinators.tsx` | Coordinators | Tanisha |
| `closing.tsx` | Findings, what we combined, the roadmap, open source, thank you | Paras |

System admins are out of scope: we struck them off during the research, as
they play little part in running the timetable and Moodle. `OUT_OF_SCOPE` in
`src/content/team.ts` crosses them out on "Who we heard from" and every
stakeholder map after it. Their section, `admins.tsx`, is kept but is not in
the running order (`src/sections/index.ts`).

Each stakeholder file starts with its research as plain data — `RESEARCH`,
`PERSONAS`, `DAYS`, `PROBLEMS`, `CHAPTERS` — and the slides below only arrange
it. To fill in your findings, edit the data:

- **Placeholders.** Anything wrapped in `<Ph>…</Ph>` is a stand-in (a number,
  a quote, a name). It shows with a dashed amber underline so it can never be
  presented by accident. Replace the text, then delete the `<Ph>` around it.
- **The research is a first round, shown as collected.** Tallies are kept as
  collected, `{ count, of }` (8 of the 11 students surveyed, say), and the
  slides show them as they are. Shares ("73%") are real and plain. Show a count
  with `<Projected n={…} />` or `<Of t={tally} />`, never as a typed number.
  `PROJECTION` in `src/content/research.tsx` is 1; set it higher to preview the
  slides with a bigger sample, and every head count is multiplied and marked as
  a placeholder (the speaker notes don't follow it). When the second round is
  in, put its tallies in the section files. A tally with no research behind
  it is `placeholder: true`: never projected, always marked.
- **The ranking re-sorts itself.** Each problem has a `reach` (how many raised
  it), a `severity` (1–5: faculty and coordinators rated theirs themselves, high
  5, medium 3, low 1; for students it is our estimate) and a `scope`:
  `core` (the timetable, attendance, scheduling and tracking classes, tests and
  assignments) or `future` (file uploads, course material and everything else,
  a far stretch). The score is reach × severity/5 × scope/5, with scope weighing
  5 or 1, out of 100. The ranking slide sorts by reach × severity first, then
  brings in scope and sorts again, so the room sees what scope changes. Fixing
  the data fixes the animation.
- **Features, one at a time.** After the ranking, `chapterSlides`
  (`src/sections/_chapters.tsx`) walks the problems in `CHAPTERS`, one or two at
  a time: back to the list (`ProblemTrack`) with the numbers behind them, then
  the feature that answers them, shown working in Plannr, then back to the list
  with those problems ticked, and a recap at the end. Problems outside our scope
  are marked Later. Every feature is presented as Plannr today, as a product
  mock-up. (`Feature` still accepts `status: "planned"` and `planned` points,
  which draw a Planned chip and outlined rings, but the deck uses neither.)
- **Speaker notes** are the `notes` of each slide: one paragraph per build, so
  the presenter view follows along. `[Square brackets]` in a script mark
  something to fill in or do: "[read the quote]".
- **Days are schedules.** `DAYS` draws a day hour by hour, one lane per kind
  of person: what they do and when, and how they keep track of it. It is not
  where problems go. Leave its events without a `tone`; the problems come
  after, on their own slides.
- **Photos.** Put files in `public/images/` (see `public/images/CREDITS.md` for
  what is there and its licence). Team photos: add `photo:
  "/images/team/sonal.jpg"` to your entry in `src/content/team.ts` and every
  avatar uses it. Interview photos and screenshots of the old timetable can go
  wherever an `ImageSlot` is drawn — it shows a labelled frame until it has a
  picture.

## How it is put together

```
src/
  sections/   the talk: slide order, data and speaker notes (edit these)
  templates/  slide layouts shared by every section (problems, charts, ranking, …)
  visuals/    the bespoke animated pictures (the old site, phone demos, product demos, …)
  ui/         icons (Phosphor), mark, device frames, Bezel, Card, Chip, mock-up pieces
  content/    the team, the stakeholders, the data shapes, scoring and the projection
  deck/       the engine: canvas, navigation, morphs, builds, presenter view
```

Slides are laid out on a fixed **1920 × 1080 canvas** that is scaled to the
screen, so sizes are real pixels on a 1080p projector. The deck's top bar sits
above y = 112 and the progress line in the bottom 104px; `SlideBody` gives the
content box in between.

### A slide

```tsx
{
  id: "students-ranking",          // the URL: /#students-ranking
  title: "What hurts most",        // for the overview and presenter view
  steps: 6,                        // builds before the next slide
  notes: ["…", "…", "…", "…", "…", "…"], // the script, one per build
  render: ({ step, active }) => (
    <ProblemRanking stakeholder="students" problems={PROBLEMS} step={step} … />
  ),
}
```

Optional: `theme: "light"`, `chrome: false` (no top bar), `speaker` (when it is
not the section's presenter).

### Builds

A template or visual turns `step` into motion with `useSteps` — one paused GSAP
timeline, with a `mark()` at the end of each build. Moving forward plays to the
next mark, moving back plays it in reverse:

```tsx
const ref = useRef<HTMLDivElement>(null);
useSteps(ref, step, (tl, mark) => {
  tl.from(".dot", { scale: 0, stagger: 0.04 });
  mark(); // build 1
  tl.from(".bar", { scaleX: 0, transformOrigin: "left" });
  mark(); // build 2
});
```

### Morphs

Give an element the same `data-flip-id` on two consecutive slides and it
travels between them (position, size, colour, radius and type size) while
everything else dissolves. The deck uses this on purpose throughout:

| From | To | Flip id |
| --- | --- | --- |
| Cover mark | Top-bar mark | `deck-mark` |
| Old timetable site | Its window among the three apps | `app-timetable` |
| Stakeholder card | Section opener | `stake-<id>-card`, `-title`, `-icon`, `-owner` |
| Day timeline lane | Persona card | `<section>-persona-<id>` |
| Sticky note → chart row → ranking row → list row → feature chip → list row | | `<section>-problem-<id>` |
| Ranking's rank number | The list's rank number | `<section>-rank-<i>` |

Rules: an id is unique within a slide; put it on a box (block or
inline-block); animate the element's children, never the element itself. The
details are at the top of `src/deck/morph.ts`.

All GSAP imports go through `src/deck/gsap.ts`, which registers Flip,
MorphSVG, DrawSVG, SplitText, ScrambleText, MotionPath, Text and CustomEase.

## Pictures of the slides

```bash
npm run snapshot                                   # every slide and build → snapshots/
npm run snapshot -- --slides students-ranking --mid   # one slide, plus mid-morph
npm run snapshot -- --steps last --scale 2         # final state of each, retina-sharp
```

It photographs a running deck, the dev server by default (`--url` for
another), and starts no server of its own. Each slide is reached from the one
before, so the morph plays as it does in the room. Handy for the report, or for
a PDF (select the PNGs in Finder → Quick Actions → Create PDF).

## Checks

```bash
npm run check          # lint + typecheck
```
