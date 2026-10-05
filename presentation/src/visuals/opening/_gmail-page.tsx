"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

/*
 * Gmail on the web as it looks in October 2026: the Material 3 inbox with the
 * navigation collapsed to its rail and the side panel hidden, the Primary /
 * Promotions / Social tabs, and the conversation view an opened mail fills
 * the card with. Built against Google's own Workspace Updates screenshots of
 * the inbox and of an open conversation: Gmail's palette (#f8fafd page,
 * white card radius 16, #f2f6fc read rows, #0b57d0 active tab, #c2e7ff
 * compose, #e9eef6 search, half-strength row checkboxes and stars), its 64px
 * header, 48px toolbars, 56px tabs and 40px default-density rows, Material
 * Symbols icons, the gradient M from Google's May 2026 icon refresh, and
 * Google Sans for the UI with Arial for the message body.
 *
 * Real Gmail has no layout for a 520px window (it stops reflowing well above
 * that and scrolls sideways), so the page is drawn as Gmail lays out at
 * 640 x 576, wide enough for the conversation toolbar's full set of icons,
 * and scaled by 520 / 640 (0.8125) into the window's 520 x 468.
 *
 * The inbox is Tuesday 6 October 2026 just before 8:12 AM: today's mail
 * shows a time, older mail a date, unread rows are white and bold.
 *
 * ---------------------------------------------------------------------------
 * GmailPage fills the browser window's content area, 520 x 468 canvas px.
 * Everything inside is in LAYOUT px (640 x 576), scaled by GMAIL_SCALE. The
 * GMAIL constants are layout px too, and so are the `top`, `height` and `y`
 * ThreeApps tweens, because the hooks live inside the scaled layer.
 * Hooks ThreeApps animates (keep the class names):
 *   .ta-list     the inbox rows already there, pushed down GMAIL.row at build 1
 *   .ta-newrow   the coordinator's mail, arriving at the top of the list
 *                (absolute at the list's top, `invisible` until it arrives).
 *                The list box clips at GMAIL.listTop, the tabs' hairline, so
 *                the row slides in from under the tabs, never over them.
 *   .ta-count-old / .ta-count-new   the list toolbar's "1-50 of 1,284",
 *                swapped for "1-50 of 1,285" as the mail lands
 *   .ta-pane     the opened mail: a white card ThreeApps grows from the row's
 *                slot (GMAIL.listTop, GMAIL.row) to the card (GMAIL.paneTop,
 *                GMAIL.paneHeight). Gmail on the web swaps it in one frame;
 *                the deck keeps the row opening into the mail (Material's
 *                container transform, which is how Gmail's apps open one).
 *   .ta-pane-in  the conversation's parts, fading up in order as it lands:
 *                toolbar, subject, sender, body
 * The 2:00 PM / Room 406 sentence ends at page y 262 and the signature at
 * page y 343, both above the fact card ThreeApps lays over page y 380.
 */

/** Drawn layout, before the scale that fits it to the window. */
const LAYOUT = { width: 640, height: 576 } as const;
export const GMAIL_SCALE = 520 / LAYOUT.width;

/* The white card the list and the open mail sit in: right of the collapsed
 * nav rail (72), under the 64px header, 16px clear of the right and bottom
 * edges (the side panel is hidden). */
const CARD = {
  left: 72,
  top: 64,
  width: LAYOUT.width - 72 - 16,
  height: LAYOUT.height - 64 - 16,
} as const;

/** Layout ThreeApps' timeline needs, in layout px (see above). */
export const GMAIL = {
  /** Default density row height. */
  row: 40,
  /** Card top + list toolbar (48) + category tabs (56). */
  listTop: 168,
  paneTop: CARD.top,
  paneHeight: CARD.height,
} as const;

/* Google Sans, the face Gmail's Material 3 UI is set in: open source since
 * 2025 and loaded by the root layout from src/fonts (next/font/local), as
 * --font-google-sans. */
export const GMAIL_FONT: CSSProperties = {
  fontFamily:
    'var(--font-google-sans), "Google Sans", var(--font-roboto), Roboto, Arial, sans-serif',
};

/* Gmail's Material 3 palette (the values its stylesheet uses). */
const C = {
  page: "#f8fafd",
  card: "#ffffff",
  ink: "#1f1f1f",
  icon: "#444746",
  /* A row's checkbox and star: the icon colour at half strength, much
   * lighter than the toolbar's. */
  rowIcon: "rgba(68,71,70,0.5)",
  muted: "#5e5e5e",
  snippet: "#5f6368",
  search: "#e9eef6",
  compose: "#c2e7ff",
  composeInk: "#001d35",
  navActive: "#d3e3fd",
  blue: "#0b57d0",
  readRow: "#f2f6fc",
  hairline: "rgba(100,121,143,0.122)",
  divider: "#c4c7c5",
} as const;

/* ------------------------------------------------------------------------ */
/* Material Symbols (outlined, weight 400), the set Gmail draws its icons    */
/* with, inlined so the deck works offline.                                  */

const SYM = {
  addReaction:
    "M480-480Zm0 400q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q43 0 83 8.5t77 24.5v90q-35-20-75.5-31.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480q0-32-6.5-62T776-600h86q9 29 13.5 58.5T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm320-600v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80ZM620-520q25 0 42.5-17.5T680-580q0-25-17.5-42.5T620-640q-25 0-42.5 17.5T560-580q0 25 17.5 42.5T620-520Zm-280 0q25 0 42.5-17.5T400-580q0-25-17.5-42.5T340-640q-25 0-42.5 17.5T280-580q0 25 17.5 42.5T340-520Zm263.5 221.5Q659-337 684-400H276q25 63 80.5 101.5T480-260q68 0 123.5-38.5Z",
  addTask:
    "M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q65 0 123 19t107 53l-58 59q-38-24-81-37.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q32 0 62-6t58-17l60 61q-41 20-86 31t-94 11Zm280-80v-120H640v-80h120v-120h80v120h120v80H840v120h-80ZM424-296 254-466l56-56 114 114 400-401 56 56-456 457Z",
  apps: "M183.5-183.5Q160-207 160-240t23.5-56.5Q207-320 240-320t56.5 23.5Q320-273 320-240t-23.5 56.5Q273-160 240-160t-56.5-23.5Zm240 0Q400-207 400-240t23.5-56.5Q447-320 480-320t56.5 23.5Q560-273 560-240t-23.5 56.5Q513-160 480-160t-56.5-23.5Zm240 0Q640-207 640-240t23.5-56.5Q687-320 720-320t56.5 23.5Q800-273 800-240t-23.5 56.5Q753-160 720-160t-56.5-23.5Zm-480-240Q160-447 160-480t23.5-56.5Q207-560 240-560t56.5 23.5Q320-513 320-480t-23.5 56.5Q273-400 240-400t-56.5-23.5Zm240 0Q400-447 400-480t23.5-56.5Q447-560 480-560t56.5 23.5Q560-513 560-480t-23.5 56.5Q513-400 480-400t-56.5-23.5Zm240 0Q640-447 640-480t23.5-56.5Q687-560 720-560t56.5 23.5Q800-513 800-480t-23.5 56.5Q753-400 720-400t-56.5-23.5Zm-480-240Q160-687 160-720t23.5-56.5Q207-800 240-800t56.5 23.5Q320-753 320-720t-23.5 56.5Q273-640 240-640t-56.5-23.5Zm240 0Q400-687 400-720t23.5-56.5Q447-800 480-800t56.5 23.5Q560-753 560-720t-23.5 56.5Q513-640 480-640t-56.5-23.5Zm240 0Q640-687 640-720t23.5-56.5Q687-800 720-800t56.5 23.5Q800-753 800-720t-23.5 56.5Q753-640 720-640t-56.5-23.5Z",
  archive:
    "m480-240 160-160-56-56-64 64v-168h-80v168l-64-64-56 56 160 160ZM200-640v440h560v-440H200Zm0 520q-33 0-56.5-23.5T120-200v-499q0-14 4.5-27t13.5-24l50-61q11-14 27.5-21.5T250-840h460q18 0 34.5 7.5T772-811l50 61q9 11 13.5 24t4.5 27v499q0 33-23.5 56.5T760-120H200Zm16-600h528l-34-40H250l-34 40Zm264 300Z",
  arrowBack: "m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z",
  arrowDropDown: "M480-360 280-560h400L480-360Z",
  checkBoxOutlineBlank:
    "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Z",
  chevronLeft: "M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z",
  chevronRight: "M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z",
  close:
    "m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z",
  delete:
    "M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z",
  driveFileMove:
    "m488-400-65 65 56 56 161-161-161-161-56 56 65 65H320v80h168ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z",
  draft:
    "M240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z",
  edit: "M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z",
  expandMore: "M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z",
  group:
    "M40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm720 0v-120q0-44-24.5-84.5T666-434q51 6 96 20.5t84 35.5q36 20 55 44.5t19 53.5v120H760ZM247-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47Zm466 0q-47 47-113 47-11 0-28-2.5t-28-5.5q27-32 41.5-71t14.5-81q0-42-14.5-81T544-792q14-5 28-6.5t28-1.5q66 0 113 47t47 113q0 66-47 113ZM120-240h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q440-607 440-640t-23.5-56.5Q393-720 360-720t-56.5 23.5Q280-673 280-640t23.5 56.5Q327-560 360-560t56.5-23.5ZM360-240Zm0-400Z",
  help: "M513.5-254.5Q528-269 528-290t-14.5-35.5Q499-340 478-340t-35.5 14.5Q428-311 428-290t14.5 35.5Q457-240 478-240t35.5-14.5ZM442-394h74q0-33 7.5-52t42.5-52q26-26 41-49.5t15-56.5q0-56-41-86t-97-30q-57 0-92.5 30T342-618l66 26q5-18 22.5-39t53.5-21q32 0 48 17.5t16 38.5q0 20-12 37.5T506-526q-44 39-54 59t-10 73Zm38 314q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z",
  inbox:
    "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-120H640q-30 38-71.5 59T480-240q-47 0-88.5-21T320-320H200v120Zm349-142q31-22 43-58h168v-360H200v360h168q12 36 43 58t69 22q38 0 69-22ZM200-200h560-560Z",
  label:
    "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h440q19 0 36 8.5t28 23.5l216 288-216 288q-11 15-28 23.5t-36 8.5H160Zm0-80h440l180-240-180-240H160v480Zm220-240Z",
  markEmailUnread:
    "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h404q-4 20-4 40t4 40H160l320 200 146-91q14 13 30.5 22.5T691-572L480-440 160-640v400h640v-324q23-5 43-14t37-22v360q0 33-23.5 56.5T800-160H160Zm0-560v480-480Zm515 45q-35-35-35-85t35-85q35-35 85-35t85 35q35 35 35 85t-35 85q-35 35-85 35t-85-35Z",
  menu: "M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z",
  moreVert:
    "M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z",
  openInNew:
    "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z",
  print:
    "M640-640v-120H320v120h-80v-200h480v200h-80Zm-480 80h640-640Zm560 100q17 0 28.5-11.5T760-500q0-17-11.5-28.5T720-540q-17 0-28.5 11.5T680-500q0 17 11.5 28.5T720-460Zm-80 260v-160H320v160h320Zm80 80H240v-160H80v-240q0-51 35-85.5t85-34.5h560q51 0 85.5 34.5T880-520v240H720v160Zm80-240v-160q0-17-11.5-28.5T760-560H200q-17 0-28.5 11.5T160-520v160h80v-80h480v80h80Z",
  refresh:
    "M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z",
  reply:
    "M760-200v-160q0-50-35-85t-85-35H273l144 144-57 56-240-240 240-240 57 56-144 144h367q83 0 141.5 58.5T840-360v160h-80Z",
  report:
    "M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240ZM330-120 120-330v-300l210-210h300l210 210v300L630-120H330Zm34-80h232l164-164v-232L596-760H364L200-596v232l164 164Zm116-280Z",
  schedule:
    "m612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z",
  search:
    "M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z",
  sell: "M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Zm220 160Z",
  send: "M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z",
  settings:
    "m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z",
  star: "m354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Zm247-350Z",
  unfoldMore:
    "M480-120 300-300l58-58 122 122 122-122 58 58-180 180ZM358-598l-58-58 180-180 180 180-58 58-122-122-122 122Z",
  tune: "M440-120v-240h80v80h320v80H520v80h-80Zm-320-80v-80h240v80H120Zm160-160v-80H120v-80h160v-80h80v240h-80Zm160-80v-80h400v80H440Zm160-160v-240h80v80h160v80H680v80h-80Zm-480-80v-80h400v80H120Z",
} as const;

type SymName = keyof typeof SYM;

function Sym({
  name,
  size = 20,
  color = C.icon,
  style,
}: {
  name: SymName;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 -960 960 960"
      width={size}
      height={size}
      fill={color}
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      <path d={SYM[name]} />
    </svg>
  );
}

/** An icon centred at (x, y) in its parent, as Gmail's 40px buttons place it. */
function IconAt({
  name,
  x,
  y,
  size = 20,
  color,
}: {
  name: SymName;
  x: number;
  y: number;
  size?: number;
  color?: string;
}) {
  return (
    <span
      className="absolute"
      style={{ left: x - size / 2, top: y - size / 2 }}
    >
      <Sym name={name} size={size} color={color} />
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* The Gmail M, 2026: the gradient mark from Google's May 2026 icon refresh  */
/* (Wikimedia Commons, "Gmail icon (2026).svg").                            */

export function GmailLogo({ width }: { width: number }) {
  const id = useId().replace(/:/g, "");
  const right = `gm-r-${id}`;
  const top = `gm-t-${id}`;
  const t = "matrix(4.5454426,0,0,4.5454426,-36.362684,-118.18025)";
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 636.36322"
      width={width}
      height={(width * 636.36322) / 800}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient
          id={right}
          x1="165"
          x2="165"
          y1="44"
          y2="166"
          gradientUnits="userSpaceOnUse"
          gradientTransform={t}
        >
          <stop stopColor="#60d673" />
          <stop offset=".17" stopColor="#42c868" />
          <stop offset=".39" stopColor="#0ebc5f" />
          <stop offset=".62" stopColor="#00a9bb" />
          <stop offset=".86" stopColor="#3c90ff" />
          <stop offset="1" stopColor="#3186ff" />
        </linearGradient>
        <linearGradient
          id={top}
          x1="8"
          x2="184"
          y1="46.13"
          y2="46.13"
          gradientUnits="userSpaceOnUse"
          gradientTransform={t}
        >
          <stop offset=".08" stopColor="#ff63a0" />
          <stop offset=".3" stopColor="#fc413d" />
          <stop offset=".65" stopColor="#fc413d" />
          <stop offset=".72" stopColor="#fc5c30" />
          <stop offset=".86" stopColor="#feb10c" />
          <stop offset=".91" stopColor="#fec700" />
          <stop offset=".96" stopColor="#ffdb0f" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${right})`}
        d="M627.27 81.82H800v500c0 30.12-24.42 54.54-54.55 54.54h-90.9a27.27 27.27 0 0 1-27.28-27.27z"
      />
      <path
        fill="#fc413d"
        d="M172.73 81.82H0v500c0 30.12 24.42 54.54 54.55 54.54h90.9a27.27 27.27 0 0 0 27.28-27.27z"
      />
      <path
        fill={`url(#${top})`}
        d="M141.94 20.26C105.42-10.44 50.95-5.72 20.26 30.8c-30.7 36.5-25.98 90.99 10.54 121.68l345.8 290.68a36.36 36.36 0 0 0 46.8 0l345.8-290.68c36.51-30.7 41.23-85.17 10.54-121.69-30.69-36.5-85.17-41.22-121.68-10.53L400 237.18Z"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------------ */
/* The inbox.                                                                */

interface Mail {
  from: ReactNode;
  subject: string;
  snippet: string;
  when: string;
  unread?: boolean;
}

/* Tuesday 6 October 2026, before 8:12 AM: today's mail shows a time, older
 * mail a date. */
const INBOX: Mail[] = [
  {
    from: "Exam Cell",
    subject: "IA 2 seating plan",
    snippet:
      "Dear students, the IA 2 seating plan is now on the notice board. Please report 15 minutes early.",
    when: "7:58 AM",
    unread: true,
  },
  {
    from: "Placement Cell",
    subject: "Pre-placement talk, 8 Oct",
    snippet:
      "All final-year BCA students are requested to register by Wednesday evening.",
    when: "7:31 AM",
    unread: true,
  },
  {
    from: "SICSR Library",
    subject: "Reminder: book due on 7 Oct",
    snippet:
      "The book The Design of Everyday Things issued to you is due on Wednesday.",
    when: "Oct 5",
  },
  {
    from: "Student Council",
    subject: "Tech fest volunteers",
    snippet:
      "Hi everyone, we are looking for volunteers for registrations and the hackathon desk.",
    when: "Oct 5",
  },
  {
    from: "Accounts Office",
    subject: "Fee receipt, Semester VII",
    snippet:
      "Dear student, your fee payment for Semester VII has been received. Thank you.",
    when: "Oct 3",
  },
  {
    from: (
      <>
        Ananya, me <span style={{ fontSize: 12, color: C.muted }}>3</span>
      </>
    ),
    subject: "Re: DT assignment, group 4",
    snippet: "I've added the empathy map to the doc, can you check it tonight?",
    when: "Oct 2",
  },
  {
    from: "Rohan",
    subject: "Mini project review slots",
    snippet: "The review slots are up on the sheet, pick one before Friday.",
    when: "Oct 1",
  },
  {
    from: "Symbiosis Sports",
    subject: "Inter-institute cricket trials",
    snippet:
      "Trials for the inter-institute tournament will be held at the Lavale ground.",
    when: "Sep 30",
  },
  {
    from: "IT Helpdesk",
    subject: "Wi-Fi password change for students",
    snippet: "The campus Wi-Fi password for students changes on 1 October.",
    when: "Sep 29",
  },
  {
    from: "Training Cell",
    subject: "Aptitude test practice series",
    snippet:
      "The weekly aptitude practice tests start this Saturday in the computer lab.",
    when: "Sep 27",
  },
];

const NEW_MAIL: Mail = {
  from: "BCA Coordinator",
  subject: "Change in today's schedule",
  snippet:
    "Dear students, Today's Design Thinking and Problem Solving lecture for BCA Sem VII, Div A has been moved from 9:00 AM to 2:00 PM, in Room 406.",
  when: "8:12 AM",
  unread: true,
};

/* Row columns, from Gmail's list at default density. */
const COL = { check: 26, star: 54, from: 80, fromW: 120, subject: 212 };

function Row({ mail, className }: { mail: Mail; className?: string }) {
  const weight = mail.unread ? 700 : 400;
  return (
    <div
      className={`absolute inset-x-0 ${className ?? ""}`}
      style={{
        height: GMAIL.row,
        background: mail.unread ? C.card : C.readRow,
        boxShadow: `inset 0 -1px 0 0 ${C.hairline}`,
        fontSize: 14,
        lineHeight: "20px",
        color: C.ink,
      }}
    >
      <IconAt
        name="checkBoxOutlineBlank"
        x={COL.check}
        y={20}
        color={C.rowIcon}
      />
      <IconAt name="star" x={COL.star} y={20} color={C.rowIcon} />
      <span
        className="absolute truncate"
        style={{
          left: COL.from,
          width: COL.fromW,
          top: 10,
          fontWeight: weight,
        }}
      >
        {mail.from}
      </span>
      <span
        className="absolute truncate"
        style={{ left: COL.subject, right: 76, top: 10 }}
      >
        <span style={{ fontWeight: weight }}>{mail.subject}</span>
        <span style={{ color: C.snippet }}> - {mail.snippet}</span>
      </span>
      <span
        className="absolute text-right"
        style={{
          right: 16,
          top: 10,
          fontSize: 12,
          fontWeight: weight,
          color: C.ink,
        }}
      >
        {mail.when}
      </span>
    </div>
  );
}

function ListToolbar() {
  return (
    <div className="absolute inset-x-0 top-0" style={{ height: 48 }}>
      <IconAt name="checkBoxOutlineBlank" x={26} y={24} />
      <IconAt name="arrowDropDown" x={46} y={24} size={18} />
      <IconAt name="refresh" x={86} y={24} />
      <IconAt name="moreVert" x={126} y={24} />
      {/* The total goes up by one when the coordinator's mail lands. */}
      <span
        className="ta-count-old absolute"
        style={{ right: 92, top: 16, fontSize: 12, color: C.icon }}
      >
        1-50 of 1,284
      </span>
      <span
        className="ta-count-new invisible absolute"
        style={{ right: 92, top: 16, fontSize: 12, color: C.icon }}
      >
        1-50 of 1,285
      </span>
      <IconAt name="chevronLeft" x={CARD.width - 65} y={24} color={C.divider} />
      <IconAt name="chevronRight" x={CARD.width - 29} y={24} />
    </div>
  );
}

const TABS: { name: SymName; label: string }[] = [
  { name: "inbox", label: "Primary" },
  { name: "sell", label: "Promotions" },
  { name: "group", label: "Social" },
];

function Tabs() {
  const w = CARD.width / TABS.length;
  return (
    <div
      className="absolute inset-x-0"
      style={{
        top: 48,
        height: 56,
        boxShadow: `inset 0 -1px 0 0 ${C.hairline}`,
      }}
    >
      {TABS.map((t, i) => {
        const on = i === 0;
        const ink = on ? C.blue : C.icon;
        return (
          <div
            key={t.label}
            className="absolute top-0 flex h-full items-center"
            style={{ left: i * w, width: w, paddingLeft: 16, gap: 16 }}
          >
            <Sym name={t.name} color={ink} />
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: ink,
                letterSpacing: "0.0107em",
              }}
            >
              {t.label}
            </span>
            {on && (
              <span
                className="absolute bottom-0"
                style={{
                  left: 8,
                  right: 8,
                  height: 3,
                  borderRadius: "3px 3px 0 0",
                  background: C.blue,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The header and the collapsed navigation rail.                             */

function Header() {
  const searchLeft = 184;
  const searchRight = LAYOUT.width - 180;
  return (
    <div className="absolute inset-x-0 top-0" style={{ height: 64 }}>
      <IconAt name="menu" x={32} y={32} size={24} />
      <span className="absolute" style={{ left: 74, top: 20 }}>
        <GmailLogo width={30} />
      </span>
      <span
        className="absolute"
        style={{
          left: 113,
          top: 17,
          fontSize: 22,
          lineHeight: "28px",
          color: C.icon,
        }}
      >
        Gmail
      </span>
      <div
        className="absolute flex items-center"
        style={{
          left: searchLeft,
          width: searchRight - searchLeft,
          top: 8,
          height: 48,
          borderRadius: 24,
          background: C.search,
          paddingLeft: 18,
          paddingRight: 18,
          gap: 18,
        }}
      >
        <Sym name="search" size={24} />
        <span style={{ fontSize: 16, color: C.icon, flex: 1 }}>
          Search mail
        </span>
        <Sym name="tune" size={24} />
      </div>
      <IconAt name="help" x={LAYOUT.width - 152} y={32} size={24} />
      <IconAt name="settings" x={LAYOUT.width - 112} y={32} size={24} />
      <IconAt name="apps" x={LAYOUT.width - 72} y={32} size={24} />
      {/* The student's account: a letter avatar, as Google draws one for an
          account without a photo. */}
      <span
        className="absolute flex items-center justify-center rounded-full text-white"
        style={{
          left: LAYOUT.width - 44,
          top: 16,
          width: 32,
          height: 32,
          background: "#00897b",
          fontSize: 15,
          fontWeight: 500,
        }}
      >
        P
      </span>
    </div>
  );
}

const NAV: SymName[] = ["inbox", "star", "schedule", "send", "draft"];

function Rail() {
  return (
    <div className="absolute top-0 left-0" style={{ width: CARD.left }}>
      {/* Compose, collapsed to its icon. */}
      <span
        className="absolute flex items-center justify-center"
        style={{
          left: 8,
          top: 70,
          width: 56,
          height: 56,
          borderRadius: 16,
          background: C.compose,
        }}
      >
        <Sym name="edit" size={24} color={C.composeInk} />
      </span>
      {NAV.map((n, i) => (
        <span
          key={n}
          className="absolute flex items-center justify-center"
          style={{
            left: 8,
            top: 142 + i * 32,
            width: 56,
            height: 32,
            borderRadius: 16,
            background: i === 0 ? C.navActive : undefined,
          }}
        >
          <Sym name={n} color={i === 0 ? C.composeInk : C.icon} />
        </span>
      ))}
      <IconAt name="expandMore" x={36} y={142 + NAV.length * 32 + 16} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The open conversation.                                                    */

/* The sender line's timestamp box: clear of the star at CARD.width - 119. */
const SENDER_TIME_RIGHT = 140;
const SENDER_TIME_WIDTH = 132;

function Divider({ x }: { x: number }) {
  return (
    <span
      className="absolute"
      style={{ left: x, top: 16, width: 1, height: 20, background: C.divider }}
    />
  );
}

/*
 * The conversation, on a card the size of the list's. ThreeApps grows the
 * card out of the new row (its `top` and `height`, in layout px) and fades
 * the parts in as it lands; each part is placed from the card's top, so it
 * reads right at the card's final size.
 */
function Pane() {
  return (
    <div
      className="ta-pane invisible absolute overflow-hidden"
      style={{
        left: CARD.left,
        width: CARD.width,
        top: GMAIL.paneTop,
        height: GMAIL.paneHeight,
        borderRadius: 16,
        background: C.card,
        color: C.ink,
      }}
    >
      {/* Conversation toolbar: back; archive, report spam, delete; mark
            unread, snooze, add to tasks; move to, labels, more. */}
      <div
        className="ta-pane-in absolute inset-x-0 top-0"
        style={{ height: 52 }}
      >
        <IconAt name="arrowBack" x={24} y={26} />
        <IconAt name="archive" x={77} y={26} />
        <IconAt name="report" x={111} y={26} />
        <IconAt name="delete" x={146} y={26} />
        <Divider x={169} />
        <IconAt name="markEmailUnread" x={193} y={26} />
        <IconAt name="schedule" x={228} y={26} />
        <IconAt name="addTask" x={262} y={26} />
        <Divider x={285} />
        <IconAt name="driveFileMove" x={309} y={26} />
        <IconAt name="label" x={343} y={26} />
        <IconAt name="moreVert" x={377} y={26} />
        <span
          className="absolute"
          style={{ right: 92, top: 18, fontSize: 12, color: C.icon }}
        >
          1 of 1,285
        </span>
        <IconAt
          name="chevronLeft"
          x={CARD.width - 65}
          y={26}
          color={C.divider}
        />
        <IconAt name="chevronRight" x={CARD.width - 29} y={26} />
      </div>

      {/* Subject, with the label chip Gmail puts after it; expand all,
            print and open in new window on the right. */}
      <div
        className="ta-pane-in absolute inset-x-0"
        style={{ top: 62, height: 36 }}
      >
        <span
          className="absolute flex items-center"
          style={{ left: 70, top: 4, gap: 10 }}
        >
          <span style={{ fontSize: 22, lineHeight: "28px", color: C.ink }}>
            Change in today&apos;s schedule
          </span>
          <span
            className="flex items-center"
            style={{
              height: 20,
              padding: "0 2px 0 5px",
              gap: 2,
              borderRadius: 4,
              background: "#dddddd",
              color: "#666666",
              fontSize: 12,
            }}
          >
            Inbox
            <Sym name="close" size={14} color="#666666" />
          </span>
        </span>
        <IconAt name="unfoldMore" x={CARD.width - 101} y={18} />
        <IconAt name="print" x={CARD.width - 65} y={18} />
        <IconAt name="openInNew" x={CARD.width - 29} y={18} />
      </div>

      {/* Sender. The address gives way (ellipsis) before the relative
            time does, as Gmail's header table lets it. */}
      <div
        className="ta-pane-in absolute inset-x-0"
        style={{ top: 112, height: 40 }}
      >
        <span
          className="absolute flex items-center justify-center rounded-full text-white"
          style={{
            left: 16,
            top: 0,
            width: 40,
            height: 40,
            background: "#5c6bc0",
            fontSize: 18,
            fontWeight: 500,
          }}
        >
          B
        </span>
        <span
          className="absolute flex items-baseline whitespace-nowrap"
          style={{
            left: 70,
            right: SENDER_TIME_RIGHT + SENDER_TIME_WIDTH + 12,
            top: 1,
            gap: 4,
            lineHeight: "20px",
          }}
        >
          <span
            className="shrink-0"
            style={{ fontSize: 14, fontWeight: 600, color: C.ink }}
          >
            BCA Coordinator
          </span>
          <span
            className="min-w-0 truncate"
            style={{ fontSize: 12, color: C.muted }}
          >
            &lt;bca.coordinator@sicsr.ac.in&gt;
          </span>
        </span>
        <span
          className="absolute flex items-center"
          style={{
            left: 70,
            top: 21,
            fontSize: 12,
            color: C.muted,
            lineHeight: "18px",
          }}
        >
          to bca-sem7-diva
          <Sym name="arrowDropDown" size={18} color={C.muted} />
        </span>
        <span
          className="absolute text-right whitespace-nowrap"
          style={{
            right: SENDER_TIME_RIGHT,
            width: SENDER_TIME_WIDTH,
            top: 3,
            fontSize: 12,
            color: C.muted,
          }}
        >
          8:12 AM (0 minutes ago)
        </span>
        <IconAt name="star" x={CARD.width - 119} y={11} />
        <IconAt name="addReaction" x={CARD.width - 89} y={11} />
        <IconAt name="reply" x={CARD.width - 59} y={11} />
        <IconAt name="moreVert" x={CARD.width - 29} y={11} />
      </div>

      {/* Body: a mail written in Gmail renders in Arial. The Reply and
            Forward buttons under it are left out: the fact card covers that
            strip, and they would show through it while it fades in. */}
      <div
        className="ta-pane-in absolute"
        style={{
          left: 70,
          right: 24,
          top: 178,
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 14,
          lineHeight: "20px",
          color: "#222222",
        }}
      >
        <p>Dear students,</p>
        <p style={{ marginTop: 20 }}>
          Today&apos;s Design Thinking and Problem Solving lecture for BCA Sem
          VII, Div A has been moved from 9:00 AM to 2:00 PM, in Room 406.
        </p>
        <p style={{ marginTop: 20 }}>Kindly inform your classmates.</p>
        <p style={{ marginTop: 20 }}>Regards,</p>
        <p>Office of the BCA Coordinator</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

export function GmailPage() {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: C.page, ...GMAIL_FONT }}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: LAYOUT.width,
          height: LAYOUT.height,
          transform: `scale(${GMAIL_SCALE})`,
          transformOrigin: "0 0",
        }}
      >
        <Header />
        <Rail />
        <div
          className="absolute overflow-hidden"
          style={{
            left: CARD.left,
            top: CARD.top,
            width: CARD.width,
            height: CARD.height,
            borderRadius: 16,
            background: C.card,
          }}
        >
          <ListToolbar />
          <Tabs />
          {/* The list clips at the tabs' hairline, so the arriving row can
              only ever show inside the list, never over the tabs. */}
          <div
            className="absolute inset-x-0 bottom-0 overflow-hidden"
            style={{ top: GMAIL.listTop - CARD.top }}
          >
            <Row mail={NEW_MAIL} className="ta-newrow invisible top-0" />
            <div className="ta-list">
              {INBOX.map((m) => (
                <div
                  key={m.subject}
                  className="relative"
                  style={{ height: GMAIL.row }}
                >
                  <Row mail={m} className="top-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <Pane />
      </div>
    </div>
  );
}
