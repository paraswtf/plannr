# Designing screens for Plannr

The rules every screen of the app follows. They come from the design skills the
redesign used: `interface-design` and `make-interfaces-feel-better` from the UI
Skills registry, and `redesign-existing-projects` from
`presentation/.agents/skills/`, read as product-UI guidance rather than
landing-page guidance. Where they disagree, the deck's own `presentation/DESIGN.md`
breaks the tie, because it is the owner's reading of the same skills.

The tokens live in `src/styles/globals.css`; the shared components in
`src/components/ui/` and `src/components/app/shell/`.

## The read

A working tool for a college: a student in a corridor checking where the next
class is, faculty taking a register, a coordinator clearing a queue of room
requests, an administrator keeping the institution's data right. It should feel
like a well-kept noticeboard: calm, exact, legible at a glance, with colour that
always means something.

| Dial | Value | Means |
| --- | --- | --- |
| Variance | 3 | Predictable grids and columns; the content's shape decides the layout |
| Motion | 3 | Fast, quiet feedback; real travel for things that arrive; nothing loops |
| Density | 6 | A daily tool: tight rows, generous gaps between groups |

**Light, one theme.** The cool paper ground (`--paper`), white surfaces, slate
as the one accent. Dark mode is not supported; tokens are semantic so it could
be added later without touching screens.

## Colour

Use the tokens, never raw colours. Every `rgba(68,88,121,…)` and `#b02636` that
used to be written into a screen has a name now.

| Tailwind | Use |
| --- | --- |
| `bg-paper` | the ground behind everything |
| `bg-surface`, `hover:bg-surface-hover` | cards, panels, white controls |
| `bg-tint-hover` | a row or control under the pointer |
| `bg-tint` | quiet controls, the segmented track, a resting chip |
| `bg-tint-selected` | the chosen row, option or nav item |
| `bg-tint-strong` | pressed quiet controls, avatar tiles, skeletons |
| `text-title` | titles and the words that matter |
| `text-ink` | body copy |
| `text-muted` | secondary lines (7.0:1 on white) |
| `text-faint` | tertiary meta: counts, emails, mono notes (5.2:1) |
| `text-placeholder` | placeholders only |
| `text-slate`, `text-slate-ink` | the accent as text; `slate-ink` on a wash |
| `--hair`, `--hair-soft`, `--card-ring` | hairlines: separators, inner edges, card rings |

The accent is slate. It fills the one primary button of a view, the focus ring
and the selected state, and almost nothing else.

**States** use the deck's words and always come as ink, wash and line:

| Meaning | Ink | Wash | Line |
| --- | --- | --- | --- |
| good: approved, present, free | `text-good` | `bg-good-wash` | `--good-line` |
| warn: needs a decision, contested | `text-warn` | `bg-warn-wash` | `--warn-line` |
| bad: clash, refused, error, destructive | `text-bad` | `bg-bad-wash` | `--bad-line` |
| info: explains | `text-info` | `bg-info-wash` | `--info-line` |

Red (`--red`) is also the live lamp and the now line: a class running right
now. Gold (`--mine-fill`) is "yours" on the timetable. Course colours come from
`courseTone()` and mean the course, everywhere it is written. None of these is
ever used as decoration.

A coloured dot marks real state only (live now, a verdict). Never put one
before a label for flavour.

## Type

Space Grotesk for display (titles, big numbers, room plaques), Instrument Sans
for everything you read and click, JetBrains Mono only for times, room codes,
PRNs and counts. Display text is semibold (600), not bold.

The scale (Tailwind's names, re-pointed in `globals.css`):

| Class | px | Use |
| --- | --- | --- |
| `text-2xs` | 11 | table heads, tiny counts, mono under a chip |
| `text-xs` | 12 | captions, hints, badges, meta lines, small buttons |
| `text-sm` | 13 | the working size: rows, controls, secondary copy |
| `text-base` | 14 | reading copy, primary row titles, nav |
| `text-md` | 16 | card and section titles |
| `text-lg` | 19 | dialog and drawer titles |
| `text-xl` | 24 | page titles |
| `text-2xl` | 30 | the one number a screen is about; sign-in |

Old arbitrary sizes map to the nearest step: 9.5 to 11 → `2xs`; 11.5 and 12 →
`xs`; 12.5 and 13 → `sm`; 13.5 to 14.5 → `base`; 15 to 17 → `md`; 19 to 21 →
`lg`; 24 to 28 → `xl`. **Except** inside measured layouts (the timetable grid's
blocks, the calendars' event blocks, room plaques, compact fit, anything whose
size is computed): those keep their exact numbers.

- Hierarchy comes from weight and ink first, size second. A row is a 14px
  semibold title over a 13px muted line, not 13.5 over 13.
- Sentence case everywhere. No spaced-out capitals. A table head is
  `text-2xs font-semibold text-muted`, sentence case.
- Numbers that change or line up use `tabular-nums` (the mono face already is).
- **No em or en dashes in visible text**: labels, buttons, toasts, titles,
  aria-labels. Use a comma, a full stop, a colon or parentheses, and a plain
  hyphen for ranges (`09:00-10:00`). Code comments are exempt.
- The middle dot `·` at most once per line, for metadata.

## Surfaces and depth

Elevation is a hairline ring plus a soft slate-tinted shadow, never a CSS
border, and there are three heights:

| Height | Shadow | Radius | Used by |
| --- | --- | --- | --- |
| resting | `var(--ring), var(--shadow-card)` | 14 (`--radius-card`) | `Card`, panels on the paper |
| raised | `var(--ring), var(--shadow-md)` | 12 | popovers, menus, pickers, toasts |
| floating | `var(--shadow-float)` | 18 (`--radius-dialog`) | `Dialog` |

- Use a `Card` only when the box means something (a record, a panel you act
  in). Group the rest with space and a hairline (`shadow-[0_1px_0_var(--hair-soft)]`).
- Radius scale: 6 badges and tiny chips, 8 menu rows, 10 buttons, fields and
  nav items, 12 callouts, popovers and plates, 14 cards, 18 dialogs. Nested
  corners are concentric: an inner radius is the outer one less the padding.
- People are rounded squares (`Avatar`), not circles.

## Components

Reach for these before writing a class string. If a pattern repeats and is not
here, it belongs here.

- **`Button`** (`ui/button.tsx`): `primary` (one per view, the thing it is
  for), `secondary`, `quiet`, `ghost`, `danger` (the final irreversible step),
  `danger-quiet` (the way towards one), `link` (an inline text button). Sizes
  `sm` / `md` / `lg`; `icon`, `iconAfter`, `block`, and `pressed` for a toggle
  (it sets `aria-pressed` and draws the pressed state). For a link that looks
  like a button, use `buttonClass(variant, size)` on the `<Link>`.
- **`IconButton`**: square, `label` is required (its accessible name and
  tooltip). `ghost` in toolbars and headers, `quiet` where it must look
  pressable at rest, `danger` for a row's remove (muted until pointed at).
  Sizes `xs` (inside another control), `sm`, `md`.
- **`Field`**, **`Input`**, **`Textarea`** (`ui/field.tsx`): label above,
  hint or error below, never a placeholder standing in for a label. `Input`
  takes `icon` (a search lens) and `invalid`. `fieldClass()` styles a control
  that is not an input but should look like one.
- **`Select`**, **`DatePicker`**, **`EntityPicker`**, **`SearchSelect`**:
  share the field's look; their panels are raised popovers. Each takes the
  `id` that `Field` hands its render function, so the visible label names it.
- **`Checkbox`** (`ui/checkbox.tsx`): the real input, visually hidden, with
  a drawn box that follows it (checked, indeterminate, focus, disabled); a
  label and an optional description; a 40px row on touch.
- **`Chip`** and **`ToggleChip`** (`ui/chip.tsx`): square-cornered tags. A
  `Chip` is a fact (a room's projector); a `ToggleChip` is an option that
  switches on and off (`aria-pressed`, a tick when on). Never pills.
- **`Callout`** (`ui/callout.tsx`): a boxed message in a screen, by meaning
  (`bad`, `warn`, `good`, `info`, `neutral`). `role="alert"` for an error that
  just appeared because of something the person did; `emphasis` for the one
  verdict a page leads with.
- **`EmptyState`** (`ui/empty-state.tsx`): glyph on a plate, a plain title,
  one or two sentences, and the one action that fills it. `compact` inside a card.
- **`Skeleton`** (`ui/skeleton.tsx`): plain shapes the size of what is coming.
  The region holding them carries `role="status"` and a label.
- **`Badge`**: short status words. Tones `neutral`, `slate`, `red`, `green`,
  `orange` map to the state colours above.
- **`Segmented`**: a choice between two to seven views. The chosen segment is
  a white raised tile on the tint track; `marker` marks one option (today)
  without choosing it.
- **`Dialog`** (modal, traps focus) and **`Drawer`** (docked, does not):
  header with an optional glyph plate (or `media`, such as an Avatar), title,
  subtitle; body scrolls, and a hairline appears under the header once it
  has; footer holds the buttons, primary last, stacked full width on a phone.
  `tall` holds a dialog at one height for tabbed content.
- **`PageHeader`** + **`PageBody`** (`app/shell/`): every screen. `PageBody`
  owns the gutters (16, 24, 36px) and the width cap: `full` for grids and
  tables, `wide` for mixed screens, `narrow` for forms and settings.
  `PageHeader` takes `back` (where "up" is, drawn above the title), `compact`
  (a tighter phone header for screens whose header carries controls) and
  `opaque` (paper rather than frosted glass, for loud content).
- **`Avatar`**: initials on a rounded square; `solid` for the signed-in
  person, `soft` in lists.
- **`RoomPlaque`**: a room's number drawn like the plate on its door.

## States

Every interactive element has rest, hover, pressed, focus and disabled:

- Focus is one slate outline for everything (`:focus-visible` in
  `globals.css`). Do not remove it with `outline-none` unless the control
  draws its own focus state, as fields do.
- Pressed is `active:scale-[0.97]` on buttons (0.95 on icon buttons), never
  smaller.
- Disabled is 50% opacity and `cursor-not-allowed`.
- Hit areas are at least 40px below the `lg` breakpoint (`min-h-10`), where
  the pointer is a finger. The primitives already do this.

Every list and query has loading (a `Skeleton` or the screen's own skeleton,
never a spinner), empty (`EmptyState`) and error (`Callout tone="bad"` that
says what to do next) states.

## Layout

- Page gutters come from `PageBody`; the sticky `PageHeader` uses the same
  ones, so content and title share a left edge.
- Grids and tables are full width; forms and settings stop at `narrow`.
- At 390px every multi-column layout is one column, every toolbar wraps, and
  nothing scrolls the page sideways. Wide tables scroll inside their own box.
- Rhythm: tight inside a group (8-12px), generous between groups (24-28px).

## Motion

Fast and felt, not watched. Keep every gesture and transition the app already
has; restyle around them.

- Durations: 120-160ms for presses and hovers, 200-280ms for things that
  arrive (popovers, dialogs, drawers). Ease out (`ease-out`, which is
  `--ease-out`); nothing eases in. Name the properties you transition, never
  `transition-all`.
- Something that arrives travels for real: the phone menu slides in from the
  edge it lives at, rather than fading in place.
- `prefers-reduced-motion` keeps fades and drops travel (`motion-reduce:`).
- No animation on things done a hundred times a day: typing, switching tabs,
  hovering rows.

## Copy

- Plain, specific and in the college's own words (cohorts, divisions, groups,
  PRN). No exclamation marks, no "Oops".
- An error says what happened and what to do next.
- A button says what it does ("Approve booking", not "Submit").

## Before a screen is done

- [ ] Tokens only: no raw hex or rgba in the screen's classes or styles
- [ ] Every button is a `Button`/`IconButton` (or `buttonClass` on a link)
- [ ] Every field has a visible label, a focus state and an error state
- [ ] One primary button per view; destructive actions are `danger`
- [ ] Type on the scale; hierarchy by weight and ink; sentence case
- [ ] No em or en dash in visible text
- [ ] Loading, empty and error states exist and look like the screen
- [ ] Keyboard: every control reachable, focus visible, Escape closes overlays
- [ ] 390px wide: one column, nothing clipped, no sideways scroll, 40px targets
- [ ] Measured layouts untouched; tests still pass
