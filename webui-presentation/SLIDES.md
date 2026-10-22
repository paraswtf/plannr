# Writing a slide

Engine, look and rules are the Design Thinking deck's (see DESIGN.md: light
keynote, one accent, no dashes, 22px+ type). Canvas is 1920x1080; content box
x 128-1792, y 132-976. Marketing shape: benefit headline, ONE visual, a tech strip.

## File shape: `src/slides/NN-name.tsx`

```tsx
import type { SlideDef } from "~/deck/types";
export const slide: SlideDef = {
  id: "google-signin",      // unique; it is the URL (#google-signin/2)
  title: "Sign in with Google", // overview + presenter view
  steps: 1,                 // builds; default 1 (none)
  notes: "script" | ["one per step"],
  render: ({ step, active }) => <SlideFrame ...>visual</SlideFrame>,
};
```
Optional: `chrome: false` (cover only). If the slide uses hooks, put
`"use client"` on top and render a component from `render` (see 02).

## Register
Import it in `src/sections/index.ts` and add it to the `slides` array (order
there is the running order). Nothing else.

## Kit: `import {...} from "./_kit"`
- `SlideFrame` props: `title` (ReactNode, wrap key phrase in `<Grad>`),
  `subhead?`, `eyebrow?` (avoid), `tech?: TechItem[]`, `children` = the
  visual. The visual box fills the space between header and strip
  (about 1664 x 520); lay it out with `absolute inset-0`.
- `TechStrip` `items: {name: string; note?: ReactNode}[]` (used by SlideFrame;
  3-6 exact method names, monospace chips).
- `Browser` (`url`, `width`, `height`) and `Phone` (`height`): device frames
  for product mock-ups; mock-ups keep Plannr's own colours.
- `CodeBlock` `code`, `title?`, `mark?: number[]` (1-based lines), `size?`:
  light highlighting, no lib; about 12 lines max.
- Re-exports: `Card` (`accent?`), `Chip`, `Icon` (Phosphor, name from
  `src/ui/icon.tsx`), `Grad`, `useSteps`, `SlideDef`, `SlideProps`.
- Other templates in `src/templates/`: Cover, Statement, VisualSlide,
  FlowDiagram, NumberedPoints, Thanks.

## Animation and morphs
- Entrances: SlideFrame animates header, visual and chips already.
- Builds: `useSteps(ref, step, (tl, mark) => {...; mark();})` from `./_kit`.
  Set resting state with `gsap.set` (from `~/deck/gsap`), NOT `tl.set` at
  time 0. Step k = timeline at the k-th `mark()`. GSAP only; eases
  `deck.enter` / `deck.morph`.
- Morph: any element with `data-flip-id="x"` that exists on two consecutive
  slides travels between them. Ids are unique per slide; use plain px/hex
  inline styles on travelling elements. SlideFrame's title already carries
  `slide-title`; the corner mark is `deck-mark`. Mark subtrees you animate
  yourself `data-no-enter`. Rules: top of `src/deck/morph.ts`.

## Check your slide (no server)
```bash
npx tsc --noEmit && npx eslint src && npx next build      # writes out/
SHOTS_DIR=/some/dir node scripts/shoot.mjs 2 3            # 1-based numbers or ids
```
One PNG per build (`NN-id-sK.png`, 1920x1080). Look at them. Never run `npm run dev`.
