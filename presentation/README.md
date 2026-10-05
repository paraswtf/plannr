# Presenting Plannr — the deck

The design thinking presentation for Plannr, built as a small web app on the
same stack as Plannr itself: Next.js (App Router), TypeScript, Tailwind v4 and
Plannr's own design tokens, fonts and icons. Every animation is GSAP, and slides
change with **morph transitions** (Keynote's Magic Move, built on GSAP Flip):
anything that appears on two slides in a row travels from one to the other.

It is a separate app from Plannr — its own `package.json`, its own build — so
nothing here touches the product.

## Running it

```bash
cd presentation
npm install
npm run dev          # http://localhost:3001  (Plannr keeps 3000)
```

To present from a build that works offline:

```bash
npm run build        # writes the static site to out/
npx serve out        # or open it from any static host
```

`out/` is plain HTML, CSS and JS: Vercel (set the root directory to
`presentation`), Netlify, GitHub Pages or a USB stick all work.

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
| `approach.tsx` | Our approach, the Apple quote, hand-over | Paras |
| `students.tsx` | Students | Sonal |
| `faculty.tsx` | Faculty (internal and external) | Ravya |
| `coordinators.tsx` | Coordinators | Tanisha |
| `admins.tsx` | System admins and management | Paras |
| `closing.tsx` | Findings, future scope, open source, credits | Paras |

Each stakeholder file starts with its research as plain data — `RESEARCH`,
`PERSONAS`, `DAYS`, `PROBLEMS`, `FEATURES` — and the slides below only arrange
it. To fill in your findings, edit the data:

- **Placeholders.** Anything wrapped in `<Ph>…</Ph>` is a stand-in (a number,
  a quote, a name). It shows with a dashed amber underline so it can never be
  presented by accident. Replace the text, then delete the `<Ph>` around it.
- **The ranking re-sorts itself.** Each problem has `personas` (which kinds of
  user run into it — its reach) and `severity` (1–5). The ranking slide
  multiplies the two and animates into that order, and the solutions slide
  takes the top few — so fixing the data fixes the animation.
- **Speaker notes** are the `notes` of each slide: one paragraph per build, so
  the presenter view follows along. `[Square brackets]` in a script mark
  something to fill in.
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
  templates/  slide layouts shared by every section (problems, ranking, …)
  visuals/    the bespoke animated pictures (the old site, phone demos, …)
  ui/         Plannr's look: icons, mark, device frames, app mock-up pieces
  content/    the team, the stakeholders and the data shapes
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
  steps: 4,                        // builds before the next slide
  notes: ["…", "…", "…", "…"],     // the script, one per build
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
travels between them — position, size, colour, radius and type size — while
everything else dissolves. The deck uses this on purpose throughout:

| From | To | Flip id |
| --- | --- | --- |
| Cover mark | Top-bar mark | `deck-mark` |
| Old timetable site | Its window among the three apps | `app-timetable` |
| Stakeholder card | Section opener | `stake-<id>-card`, `-title`, `-icon`, `-owner` |
| Day timeline lane | Persona card | `<section>-persona-<id>` |
| Sticky note → ranking row → solution | | `<section>-problem-<id>` |
| Solution's feature | Feature slide title | `<section>-feature-<id>` |
| Phone or browser on one feature slide | The next | `<section>-device` |

Rules: an id is unique within a slide; put it on a box (block or
inline-block); animate the element's children, never the element itself. The
details are at the top of `src/deck/morph.ts`.

All GSAP imports go through `src/deck/gsap.ts`, which registers Flip,
MorphSVG, DrawSVG, SplitText, ScrambleText, MotionPath, Text and CustomEase.

## Pictures of the slides

```bash
npm run build
npm run snapshot                                   # every slide and build → snapshots/
npm run snapshot -- --slides students-ranking --mid   # one slide, plus mid-morph
npm run snapshot -- --steps last --scale 2         # final state of each, retina-sharp
```

No server is started: the script hands `out/` to a headless browser straight
from disk, and reaches each slide from the one before so the morph plays as it
does in the room. Handy for the report, or for a PDF (select the PNGs in
Finder → Quick Actions → Create PDF).

## Checks

```bash
npm run check          # lint + typecheck
```
