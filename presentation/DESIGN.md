# Designing slides for this deck

The rules every slide follows. They come from the three design skills in
`.agents/skills/` (redesign-existing-projects, design-taste-frontend,
high-end-visual-design), adapted to a deck that is presented live on a
projector. Where the skills disagree, design-taste-frontend wins.

## The read

A keynote deck, presented live to a college design-thinking jury and
classmates. Calm and confident, like a light Apple keynote: one idea per
slide, large type, a lot of air, product shots that look like objects, and
motion that tells the story rather than decorating it.

| Dial | Value | Means |
| --- | --- | --- |
| Variance | 6 | Mostly calm and left-aligned; asymmetry where a slide earns it |
| Motion | 7 | Every slide moves with purpose; morphs between slides stay |
| Density | 3 | Spoken over, not read alone: few words, big type |

## Theme

**Light, one theme, every slide.** Cool off-white ground, ink type, one
accent. No dark slides, no dark sections, no inverted panels. (The presenter's
own window is dark; it is a tool, not a slide.)

Use the tokens, never raw colours, for anything that is part of the slide
rather than the product:

| Token (Tailwind) | Use |
| --- | --- |
| `bg-bg` | the ground (the stage paints it; slides are transparent) |
| `bg-raised` / `bg-card` | a raised surface (cards, panels) |
| `bg-sunken` | wells, tracks, neutral chips |
| `text-fg` | titles, the words that matter |
| `text-body` | sentences |
| `text-muted` | secondary lines, labels |
| `text-faint` | the quietest text (timestamps, axis labels); large sizes only |
| `line` / `line-strong` (`ring-hair`, `ring-strong`) | hairlines |
| `text-accent`, `bg-accent-soft`, `--accent-line` | the accent (below) |
| `text-good`, `text-warn`, `text-bad` | real state only: worked / friction / broke |

### One accent

`--accent` (#c8305f, the berry from the middle of Plannr's gradient) is the
only colour on a slide that is not ink or grey. It means "look here": the key
phrase in a title (`<Grad>`), the top rows of a ranking, the line that
connects, the step being talked about. Use it sparingly; if everything is
accented, nothing is.

- The four stakeholders **do not have colours any more**. Their tokens all
  point at the accent. A stakeholder is identified by its photo, icon and name.
- The **full brand gradient** appears on type exactly twice: the cover's
  "Plannr" and the closing thesis (`<Grad brand>`). It lives in the logo.
- `bad` is the accent; `good` and `warn` are muted and only mark state.
- Product mock-ups (inside a PhoneFrame or BrowserFrame) keep Plannr's own
  colours: course tones, slate, white cards. They are the product, not the
  slide.
- Other apps' icons (`AppIcon`, in src/visuals/opening/_app-icons.tsx) keep
  their brands' colours too, matched to their App Store icons. They are the
  apps, not the slide.

## Type

Plannr's own faces, refined: Space Grotesk (display, semibold), Instrument Sans
(body), JetBrains Mono (only for times, codes and counts, always with tabular
figures). Utilities in `globals.css`: `t-hero` 168, `t-display` 112,
`t-title` 76, `t-h2` 52, `t-h3` 34, `t-lede` 34, `t-body` 28, `t-small` 22,
`t-label` 20, `t-mono`, `tabular`.

- Sentence case everywhere. No spaced-out capitals, no mono uppercase labels.
- Titles: two lines at most, eight words or so. Ledes: 25 words at most.
- Anything the room must read: 22px or more on the canvas, prefer 26px+.
- Numbers that count or compare use `tabular` (or `t-mono`).
- Emphasis is the accent colour or weight, never a second typeface.

## Labels, numbers, punctuation

- **No label above titles.** The top bar already names the section. If a
  slide truly needs a label that says something its title does not, set it in
  `t-label` (sentence case, muted).
- **No numbering as decoration:** no "Feature 01", "Stakeholder 01 / 04",
  "01 / 04", big "01 02 03" counters. Order is shown by position and motion.
  A number that is data (a problem's rank, a count, a time) is not decoration.
- **No decorative dots.** A coloured dot only marks real state (live now).
- **No em or en dashes in anything visible.** Use a comma, a full stop, a
  colon or parentheses; a plain hyphen for ranges (9-10am). Speaker notes are
  exempt.
- The middle dot `·` at most once per line, for metadata (`10am · 304`).

## Surfaces

- **Cards only when elevation means something.** Otherwise group with space
  and hairlines. House card: `Card` from `src/ui/surfaces.tsx` (raised, 22px
  radius, hairline, `--shadow-1`); `accent` for the one highlighted card.
- **Double bezel for anything precious**: photos, product shots that are not
  already in a device, quotes. `Bezel` from `src/ui/frames.tsx` (an 8px tray
  around a plate, radii 30 / 22, concentric).
- **Chips** are `Chip` from `src/ui/surfaces.tsx`: 12px radius, never pills.
- **Radius scale**: 30 outer (bezel tray), 22 cards and plates, 12 chips and
  small tiles, avatars are rounded squares (30%), device frames keep their own.
- **Shadows** are `--shadow-1` (resting), `--shadow-2` (raised), `--shadow-3`
  (floating devices): soft, long, slate-tinted. Never black, never glows.
- **No radial glows, gradient blobs or mesh backgrounds.** The grain over the
  stage is the only texture.

## Layout

- The content box is x 128-1792, y 132-976 (`SlideBody`); the top bar lives
  above y 112 and the progress line in the bottom 104px.
- One idea per slide. Left-aligned, editorial: title top-left, the visual
  given room. Centre only the manifesto moments (the quote, the thesis, the
  thank-you).
- No rows of identical cards just because there are three or four things.
  Prefer an asymmetric split, a list with hairlines, a lead item with
  supporting items, or a layout where the content's shape decides the grid.
- Give the visual the space; a product shot should feel like the hero of its
  slide, not a thumbnail.

## Imagery

- Photos sit in a `Bezel`. No labels or pills on top of a photo. A credit,
  when a licence asks for one, is plain small type just under the frame, or
  on a soft fade at the photo's foot (`ImageSlot` does the latter).
- Product UIs are real component previews in a `PhoneFrame` or
  `BrowserFrame`, never loose rectangles pretending to be screenshots.

## Features and scope

Every feature is presented as Plannr today: a real component preview in a
`PhoneFrame` or `BrowserFrame`, in Plannr's own colours. No feature is marked
planned, next or coming soon, on a slide or inside a mock-up. A problem outside
what we set out to automate is marked **Later**: that is scope, not a promise.
The words for where a problem stands are **Built** (a check) and **Later**.

## Charts

Charts follow the dataviz method: pick the form, then colour, and validate it.

- Bars are horizontal, 24px thick, square at the baseline and rounded 4px at
  the end, growing from a hairline baseline. No gridlines, no axis labels:
  every bar carries its value at the tip.
- Emphasis, not a palette: bars are a neutral `#7c8596`; the bars the speaker
  is talking about take the accent on a build and the rest recede.
- Ratings stack in the bar: high in the accent, medium `#7c8596`, low
  `#b9c0cc`, a 2px gap in the ground colour between them, and a legend.
- A share is real and shown plain ("73%"); a head count is shown through
  `Projected` / `Of`, so it follows the projection switch and is marked when
  it is projected or a placeholder. Small samples lead with the count ("2 of
  10"), large ones with the share.
- Every chart has a source line under it (who, how many, how), a `title` on
  each bar for hover, and an sr-only table.

## Icons

`Icon` from `src/ui/icon.tsx`, which is Phosphor (light at slide sizes,
regular in mock-ups). Do not draw new icon paths by hand. Charts, diagrams and
the logo are drawings, not icons; those are fine.

## Motion

Keep every animation the deck already has: the morphs between slides, every
build, every demo. Restyle around them; do not remove them or replace travel
with fades (the person presenting rejects motion that only hints).

- GSAP only, through `~/deck/gsap`; builds through `useSteps`; eases
  `deck.enter` and `deck.morph` (or a custom curve), never linear or
  ease-in-out.
- Prefer transform and opacity in new motion. Do not rewrite working motion
  only to change the property it animates.
- Every animation answers "why does this move": hierarchy, story, state.
- Reduced motion is handled by the engine (builds jump, slides dissolve;
  `M` toggles). Loops must stop when `active` is false or
  `useDeckRuntime().instant` is true.
- Morph rules are at the top of `src/deck/morph.ts` (flip ids, plain px and
  hex inline styles on travelling elements).

## Before a slide is done

- [ ] Light ground, tokens only; no hard-coded dark-theme colours left
- [ ] Features shown working in the product; Later only for out-of-scope problems
- [ ] Head counts through `Projected` / `Of`, never typed; shares plain
- [ ] One accent, used for one thing; no stakeholder colours
- [ ] No label above the title, no numbering labels, no decorative dots
- [ ] No em or en dash in visible text; `·` at most once per line
- [ ] Type 22px+ for anything read aloud from the slide; tabular numbers
- [ ] Cards only where elevation means something; precious things in a Bezel
- [ ] No glows, no gradient text except the two brand moments
- [ ] Nothing under the top bar or the progress line; nothing clipped
- [ ] Every build still shows what the speaker says at that step
- [ ] Motion unchanged in intent, still real travel, still smooth
