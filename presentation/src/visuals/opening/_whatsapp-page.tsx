"use client";

import type { CSSProperties, ReactNode } from "react";

import { TEAM } from "~/content/team";

/*
 * WhatsApp Web as it looks in October 2026, light theme: the refreshed
 * WhatsApp Design System (WDS) layout with the left navigation rail, a white
 * 64px chat header, the beige doodle wallpaper and the floating pill
 * composer. Built against Meta's own Microsoft Store screenshots of the
 * WhatsApp app (the Windows app is WhatsApp Web in a shell) and WABetaInfo's
 * 2025-2026 WhatsApp Web screenshots, and against web.whatsapp.com's own
 * stylesheet and scripts:
 *   - colours are the light theme's WDS tokens: rail #F7F5F3, incoming
 *     bubble #FFFFFF, outgoing #D9FDD3, text #0A0A0A, secondary text
 *     rgba(0,0,0,.6), read ticks #007BFC, badges and dots #1DAA61;
 *   - sizes are WhatsApp Web's: 64px rail and header, 7.5px bubble radius,
 *     8 x 13 tails, 14.2px / 19px message text, 11px times, a 52px composer;
 *     the header's name is 16px medium over a 14px member line;
 *   - the rail is the app's: Chats (open), Calls, Status, Channels,
 *     Communities, a divider, Meta AI's ring (it ships in India); at the foot
 *     the Media hub (since November 2025), a divider, Settings and the
 *     account's own photo (the presenter's, from the deck's team list);
 *   - every icon is WhatsApp's own path data, the rail's outline variants
 *     as its nav items use them (wds-ic-chat-filled, ic-call, wds-ic-status,
 *     wds-ic-channels, wds-ic-communities, ic-filter, ic-settings,
 *     ic-videocam, ic-expand-more, ic-search, ic-more-vert, ic-add,
 *     wds-ic-sticker-smiley, ic-mic, wds-ic-read, tail-in, tail-out,
 *     ic-group-filled); Meta AI's ring, a raster asset in the app, is a
 *     conic gradient through a ring mask;
 *   - the wallpaper is WhatsApp's own beige doodle tile (bg-chat-beige),
 *     painted the way WhatsApp paints it (10% over the beige, 540px tile,
 *     from the panel's top left) and inlined as one pre-composited WebP crop,
 *     toned to read #F1EBE3 on screen as Meta's screenshots do;
 *   - type is Roboto, which WhatsApp Web now self-hosts as its body face
 *     ("Roboto Variable", Roboto, "Helvetica Neue", Helvetica, sans-serif);
 *     the deck's own Roboto (next/font, so it works offline) stands in.
 *
 * WhatsApp Web has no layout for a 520px window: its chat list and
 * conversation stop shrinking well above that and the page scrolls sideways.
 * So the window shows what fits at 1:1: the navigation rail and the open
 * conversation, as the app draws them, without the chat list.
 *
 * The conversation is the class group on Tuesday 6 October 2026. Before the
 * last build, classmates talk about the empathy map between 7:40 and 8:15 am
 * and the last word agrees with the timetable (9, in 405). At build 2 a new
 * message from Ishaan arrives at 8:20 am: 3 pm, in 701. Classmates have no
 * profile photos, so WhatsApp shows their initials on its one default pair.
 *
 * ---------------------------------------------------------------------------
 * WhatsAppPage fills the browser window's content area, 520 x 468 canvas px.
 * Hooks ThreeApps animates (keep the class names):
 *   .ta-wa-msgs    the conversation's messages, bottom-aligned so the last
 *                  visible one ends at page y 398, just above the composer;
 *                  rises WHATSAPP.lift at build 2, which is exactly the new
 *                  message's height plus the run gap, so afterwards the new
 *                  one ends at page y 398 in its turn, as WhatsApp scrolls.
 *                  It is clipped at the composer's top edge and slides under
 *                  the header.
 *   .ta-wa-new     the newest message, the last child of .ta-wa-msgs, below
 *                  that edge until the rise scrolls it in; `invisible`
 *                  until it arrives. WhatsApp shows an arriving message at
 *                  full opacity, so it is best set visible, not faded. After
 *                  the rise its text line sits at page y 352 to 371, above
 *                  the fact card ThreeApps lays over page y 380 to 448; only
 *                  its time line goes under the card.
 *   .ta-wa-typing  optional: "Ishaan is typing…" over the header's member
 *                  line, `invisible` unless ThreeApps shows it for a moment
 *                  before the rise, as WhatsApp does before a message lands.
 */

const PAGE = { width: 520, height: 468 } as const;
const RAIL = 64;
const HEADER = 64;
const COMPOSER = { height: 52, inset: 12, bottom: 10 } as const;
const COMPOSER_TOP = PAGE.height - COMPOSER.bottom - COMPOSER.height; // 406

/* The rise, as WhatsApp scrolls a new message in: the list moves up by
 * exactly what arrived, so the last message ends just above the composer
 * before and after, with no band of empty wallpaper under it. Ishaan's
 * message fills its first line, so its time drops to a line of its own:
 * the bubble runs from page y 327 to OLD_BOTTOM, its text line sits at 352 to
 * 371, above the fact card ThreeApps lays over page y 380 and down, and only
 * the time line goes under the card. */
const OLD_BOTTOM = COMPOSER_TOP - 8; // 398
/** A new sender starts a new run: WhatsApp sets runs 12px apart. */
const RUN_GAP = 12;
/** The new bubble: 6 + name line 19 + two 19px lines (text, time) + 8. */
const NEW_HEIGHT = 71;

/** How far the messages rise when the new ones land, in page px. */
export const WHATSAPP = {
  lift: RUN_GAP + NEW_HEIGHT,
} as const;

/* WhatsApp Web's body stack, with the deck's self-hosted Roboto first. */
export const WHATSAPP_FONT: CSSProperties = {
  fontFamily:
    'var(--font-roboto), "Roboto Variable", Roboto, "Helvetica Neue", Helvetica, sans-serif',
};

/* The light theme's WDS tokens, as web.whatsapp.com defines them. */
const WA = {
  text: "#0A0A0A",
  muted: "rgba(0, 0, 0, 0.6)",
  divider: "rgba(0, 0, 0, 0.1)",
  rail: "#F7F5F3",
  railIcon: "rgba(0, 0, 0, 0.62)",
  railActive: "rgba(0, 0, 0, 0.06)",
  wallpaper: "#F5F1EB",
  incoming: "#FFFFFF",
  outgoing: "#D9FDD3",
  read: "#007BFC",
  branded: "#1DAA61",
  bubbleShadow: "0 1px 0.5px rgba(11, 20, 26, 0.13)",
} as const;

/* ------------------------------------------------------------------------ */
/* WhatsApp's icons: path data from web.whatsapp.com's WDS icon modules.     */

type Icon = { d: string; evenodd?: boolean }[];

const ICON = {
  // WDSIconWdsIcChatFilled
  chatFilled: [
    {
      evenodd: true,
      d: "M22 6.67C22 5.19 20.8 4 19.33 4H1.8a1 1 0 0 0-.85 1.53L3 9v8.33C3 18.81 4.2 20 5.67 20h13.66c1.48 0 2.67-1.2 2.67-2.67V6.67ZM7 10a1 1 0 0 1 1-1h9a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H8Z",
    },
  ],
  // WDSIconIcCall
  call: [
    {
      d: "M19.95 21c-2.08 0-4.14-.45-6.17-1.36a18.3 18.3 0 0 1-5.55-3.87 18.47 18.47 0 0 1-3.87-5.54C3.46 8.18 3 6.13 3 4.04A1.02 1.02 0 0 1 4.05 3H8.1c.23 0 .44.08.63.24a.9.9 0 0 1 .32.56l.65 3.5c.03.27.03.5-.02.67-.05.19-.15.35-.28.48L6.97 10.9c.34.62.73 1.21 1.2 1.79.45.57.96 1.13 1.5 1.66A17.59 17.59 0 0 0 13.1 17l2.35-2.35a1.61 1.61 0 0 1 1.3-.4l3.45.7c.23.07.43.19.57.36.16.18.23.37.23.59v4.05A1.02 1.02 0 0 1 19.95 21ZM6.03 9l1.64-1.65L7.25 5H5.03c.08.68.2 1.36.34 2.03.16.66.37 1.32.66 1.97Zm8.95 8.95a12.42 12.42 0 0 0 4.02 1v-2.2l-2.35-.48-1.67 1.68Z",
    },
  ],
  // WDSIconWdsIcStatus
  status: [
    {
      d: "M13.56 3.14c.1-.55.62-.92 1.15-.77a10 10 0 0 1 6.98 12.1.91.91 0 0 1-1.23.6c-.52-.18-.78-.75-.66-1.3a8 8 0 0 0-5.44-9.41c-.53-.17-.9-.68-.8-1.22Zm5.34 14.65c.42.35.48.98.08 1.37a10 10 0 0 1-13.96 0c-.4-.39-.34-1.02.08-1.38a1.11 1.11 0 0 1 1.46.09 8 8 0 0 0 10.88 0c.4-.38 1.03-.44 1.45-.09ZM3.54 15.08c-.52.19-1.1-.08-1.23-.62A10 10 0 0 1 9.29 2.37c.53-.15 1.05.22 1.15.77.1.54-.27 1.05-.8 1.22a8 8 0 0 0-5.44 9.42c.12.54-.14 1.1-.66 1.3Z",
    },
    {
      evenodd: true,
      d: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z",
    },
  ],
  // WDSIconWdsIcChannels
  channels: [
    {
      evenodd: true,
      d: "M15.83 8.63A1 1 0 0 1 17.2 9a5.98 5.98 0 0 1 0 6 1 1 0 0 1-1.73-1 3.98 3.98 0 0 0 0-4 1 1 0 0 1 .36-1.37Zm-7.66 0A1 1 0 0 1 8.53 10a3.98 3.98 0 0 0 0 4 1 1 0 0 1-1.73 1 5.98 5.98 0 0 1 0-6 1 1 0 0 1 1.37-.37Z",
    },
    { d: "M13.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" },
    {
      evenodd: true,
      d: "m5.33 16.48-.23.8c-.24.77-.48 1.6-.68 2.3.7-.2 1.53-.44 2.3-.68l.8-.23.72.39a8 8 0 1 0-3.3-3.3l.4.72Zm-2.15.22A48.91 48.91 0 0 0 2 21a1 1 0 0 0 1 1c.31 0 2.46-.63 4.3-1.18a10 10 0 1 0-4.12-4.12Z",
    },
  ],
  // WDSIconWdsIcCommunities
  communities: [
    {
      evenodd: true,
      d: "M6.37 18.67a1.81 1.81 0 0 1-.58-1.24c-.01-.5-.03-1.5.03-1.94a2.7 2.7 0 0 1 .4-1.1 2.84 2.84 0 0 1 .9-.82c.46-.28.98-.46 1.4-.58A12.2 12.2 0 0 1 12 12.5a12.69 12.69 0 0 1 3.47.49 5.76 5.76 0 0 1 1.52.65c.28.19.56.44.78.76a2.41 2.41 0 0 1 .41 1.1c.06.43.04 1.43.03 1.93a1.9 1.9 0 0 1-.58 1.24c-.22.2-.48.33-.75.33H7.12c-.27 0-.53-.13-.75-.33Zm13.6-3.27c.04.6.03.86.02 1.6v.49a4.58 4.58 0 0 1-.3 1.51h2.97c.72 0 1.31-1.85 1.33-2.58.01-.4.02-.13-.02-.46a2.34 2.34 0 0 0-.95-1.6 4.27 4.27 0 0 0-1.41-.68h-.02v-.01a7.72 7.72 0 0 0-2.35-.27 4.18 4.18 0 0 1 .72 2Zm-2.04-3.95a2.65 2.65 0 0 0 3.16.06 2.67 2.67 0 1 0-3.16-.06ZM14.9 9.62A3.54 3.54 0 0 0 15.5 7a3.56 3.56 0 1 0-.61 2.62Zm-7.88.4a2.67 2.67 0 1 0-5.16-1.38 2.67 2.67 0 0 0 5.16 1.38Zm-4.42 3.6-.18.05h-.03a4.3 4.3 0 0 0-1.41.69 2.3 2.3 0 0 0-.95 1.6c-.04.33-.03 1.06-.02 1.46.02.73.61 1.58 1.33 1.58H4.3a4.58 4.58 0 0 1-.3-1.51V17c-.01-.74-.02-1 .03-1.6 0-.05 0-.1.02-.15a4.48 4.48 0 0 1 .7-1.85 7.22 7.22 0 0 0-2.16.22Zm9.4.88c-1.21 0-2.22.2-2.92.4-.37.12-.68.23-.91.38-.23.13-.3.25-.34.34a.7.7 0 0 0-.03.14s0-.01 0 0L7.79 17h8.42v-1.24c-.01-.01 0 .01 0 0a.7.7 0 0 0-.04-.14c-.03-.09-.11-.2-.34-.34a3.84 3.84 0 0 0-.91-.37c-.7-.2-1.7-.41-2.92-.41ZM12 6a1.55 1.55 0 1 0 0 3.11c.86 0 1.56-.7 1.56-1.55C13.56 6.7 12.86 6 12 6Z",
    },
  ],
  // WDSIconIcSettings
  settings: [
    {
      d: "M10.13 22a1 1 0 0 1-.98-.88l-.3-2.32a3.79 3.79 0 0 1-.61-.3c-.2-.12-.38-.24-.57-.38l-2.17.9a.98.98 0 0 1-1.25-.4L2.4 15.4a.94.94 0 0 1-.13-.7.96.96 0 0 1 .38-.6l1.87-1.42a2.39 2.39 0 0 1-.02-.34v-.68c0-.1 0-.22.02-.34L2.65 9.9a.96.96 0 0 1-.38-.6.94.94 0 0 1 .13-.7l1.85-3.22a.98.98 0 0 1 1.25-.4l2.17.9a6.82 6.82 0 0 1 1.18-.68l.3-2.33a1 1 0 0 1 .97-.87h3.76a1 1 0 0 1 .97.88l.3 2.32a5.5 5.5 0 0 1 1.17.68l2.18-.9a.98.98 0 0 1 1.25.4L21.6 8.6c.13.22.17.45.13.7a.96.96 0 0 1-.38.6l-1.88 1.42.03.34v.68c0 .1-.02.22-.05.34l1.88 1.42c.2.15.32.35.37.6.05.25 0 .48-.13.7l-1.84 3.2a1.04 1.04 0 0 1-1.28.42l-2.13-.9a6.84 6.84 0 0 1-1.17.68l-.3 2.32a1 1 0 0 1-.97.88h-3.76Zm.87-2h1.97l.35-2.65a5.6 5.6 0 0 0 2.65-1.53l2.48 1.03.98-1.7-2.16-1.63c.09-.23.15-.47.18-.73a6.15 6.15 0 0 0 0-1.58c-.03-.26-.1-.5-.18-.74l2.16-1.62-.98-1.7-2.47 1.05a5.56 5.56 0 0 0-2.66-1.55L13 4h-1.97l-.35 2.65a5.6 5.6 0 0 0-2.66 1.53L5.55 7.15l-.98 1.7 2.15 1.6a6.06 6.06 0 0 0 0 3.08l-2.15 1.62.98 1.7 2.47-1.05a5.55 5.55 0 0 0 2.66 1.55L11 20Zm1.05-4.5c.97 0 1.8-.34 2.47-1.03A3.37 3.37 0 0 0 15.55 12c0-.97-.34-1.8-1.03-2.47a3.37 3.37 0 0 0-2.47-1.03c-.98 0-1.81.34-2.49 1.03A3.4 3.4 0 0 0 8.55 12c0 .97.34 1.8 1.01 2.47.68.69 1.5 1.03 2.49 1.03Z",
    },
  ],
  // WDSIconIcFilter: the Media hub entry in the rail's foot.
  media: [
    {
      d: "M13.25 12.5 12.1 11a.48.48 0 0 0-.4-.2c-.17 0-.3.07-.4.2l-1.68 2.2a.47.47 0 0 0-.06.53c.1.18.25.27.46.27h7.96c.21 0 .37-.1.46-.28.09-.18.07-.35-.07-.52l-2.42-3.17a.48.48 0 0 0-.4-.2c-.17 0-.3.06-.4.2l-1.9 2.47ZM8 18c-.55 0-1.02-.2-1.41-.59-.4-.39-.59-.86-.59-1.41V4c0-.55.2-1.02.59-1.41C6.98 2.19 7.45 2 8 2h12c.55 0 1.02.2 1.41.59.4.39.59.86.59 1.41v12c0 .55-.2 1.02-.59 1.41-.39.4-.86.59-1.41.59H8Zm0-2h12V4H8v12Zm-4 6c-.55 0-1.02-.2-1.41-.59-.4-.39-.59-.86-.59-1.41V7c0-.28.1-.52.29-.71.19-.2.43-.29.71-.29.28 0 .52.1.71.29.2.19.29.43.29.71v13h13c.28 0 .52.1.71.29.2.19.29.43.29.71 0 .28-.1.52-.29.71A.94.94 0 0 1 17 22H4Z",
    },
  ],
  // WDSIconIcVideocam
  videocam: [
    {
      d: "M4 20c-.55 0-1.02-.2-1.41-.59-.4-.39-.59-.86-.59-1.41V6c0-.55.2-1.02.59-1.41C2.98 4.19 3.45 4 4 4h12c.55 0 1.02.2 1.41.59.4.39.59.86.59 1.41v4.5l3.15-3.15c.17-.17.35-.2.55-.13.2.09.3.25.3.48v8.6c0 .23-.1.4-.3.47-.2.09-.38.05-.55-.12L18 13.5V18c0 .55-.2 1.02-.59 1.41-.39.4-.86.59-1.41.59H4Zm0-2h12V6H4v12Z",
    },
  ],
  // WDSIconIcExpandMore
  expandMore: [
    {
      d: "M12 14.95a1.1 1.1 0 0 1-.38-.06.88.88 0 0 1-.32-.21l-4.6-4.6a.95.95 0 0 1-.28-.7.95.95 0 0 1 .98-.97c.28-.01.52.08.7.27l3.9 3.9 3.9-3.9a.95.95 0 0 1 .7-.28.95.95 0 0 1 .97.97c0 .29-.09.52-.27.7l-4.6 4.6c-.1.1-.2.18-.32.22a1.1 1.1 0 0 1-.38.06Z",
    },
  ],
  // WDSIconIcSearch
  search: [
    {
      d: "M9.5 16a6.27 6.27 0 0 1-4.61-1.89A6.27 6.27 0 0 1 3 9.5c0-1.82.63-3.35 1.89-4.61A6.27 6.27 0 0 1 9.5 3c1.82 0 3.35.63 4.61 1.89A6.27 6.27 0 0 1 16 9.5a6.1 6.1 0 0 1-1.3 3.8l5.6 5.6c.18.18.27.42.27.7 0 .28-.09.52-.27.7a.95.95 0 0 1-.7.27.95.95 0 0 1-.7-.27l-5.6-5.6A5.96 5.96 0 0 1 9.5 16Zm0-2c1.25 0 2.31-.44 3.19-1.31A4.34 4.34 0 0 0 14 9.5c0-1.25-.44-2.31-1.31-3.19A4.34 4.34 0 0 0 9.5 5c-1.25 0-2.31.44-3.19 1.31A4.34 4.34 0 0 0 5 9.5c0 1.25.44 2.31 1.31 3.19A4.34 4.34 0 0 0 9.5 14Z",
    },
  ],
  // WDSIconIcMoreVert
  more: [
    {
      d: "M12 20c-.55 0-1.02-.2-1.41-.59-.4-.39-.59-.86-.59-1.41 0-.55.2-1.02.59-1.41.39-.4.86-.59 1.41-.59.55 0 1.02.2 1.41.59.4.39.59.86.59 1.41 0 .55-.2 1.02-.59 1.41-.39.4-.86.59-1.41.59Zm0-6c-.55 0-1.02-.2-1.41-.59-.4-.39-.59-.86-.59-1.41 0-.55.2-1.02.59-1.41.39-.4.86-.59 1.41-.59.55 0 1.02.2 1.41.59.4.39.59.86.59 1.41 0 .55-.2 1.02-.59 1.41-.39.4-.86.59-1.41.59Zm0-6c-.55 0-1.02-.2-1.41-.59-.4-.39-.59-.86-.59-1.41 0-.55.2-1.02.59-1.41.39-.4.86-.59 1.41-.59.55 0 1.02.2 1.41.59.4.39.59.86.59 1.41 0 .55-.2 1.02-.59 1.41-.39.4-.86.59-1.41.59Z",
    },
  ],
  // WDSIconIcAdd
  add: [
    {
      d: "M11 13H6a.97.97 0 0 1-.71-.29A.97.97 0 0 1 5 12c0-.28.1-.52.29-.71.19-.2.43-.29.71-.29h5V6c0-.28.1-.52.29-.71.19-.2.43-.29.71-.29.28 0 .52.1.71.29.2.19.29.43.29.71v5h5c.28 0 .52.1.71.29.2.19.29.43.29.71 0 .28-.1.52-.29.71A.94.94 0 0 1 18 13h-5v5c0 .28-.1.52-.29.71A.94.94 0 0 1 12 19a.97.97 0 0 1-.71-.29A.97.97 0 0 1 11 18v-5Z",
    },
  ],
  // WDSIconWdsIcStickerSmiley
  sticker: [
    {
      d: "M8.5 10.25a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm8.5-1.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z",
    },
    {
      evenodd: true,
      d: "M16.82 19.98A6.97 6.97 0 0 1 12 22H9.27A7.27 7.27 0 0 1 2 14.73V9.27A7.27 7.27 0 0 1 9.27 2h5.46A7.27 7.27 0 0 1 22 9.27v2.54c0 1.94-.77 3.8-2.15 5.17l-3.03 3ZM14.72 4H9.28A5.27 5.27 0 0 0 4 9.27v5.46A5.27 5.27 0 0 0 9.27 20h2.06a.9.9 0 0 0 .68-.88l-.02-2.26v-.11a5.5 5.5 0 0 1-4.65-2.6.6.6 0 0 1 .03-.6c.12-.2.3-.3.53-.3h5.7a4.8 4.8 0 0 1 3.22-1.23l2.26.01c.5 0 .9-.4.9-.9V9.07H20A5.27 5.27 0 0 0 14.73 4Zm-.71 15.11c0 .15-.01.3-.04.44a4.96 4.96 0 0 0 1.44-.99l3.03-3c.46-.46.83-.99 1.09-1.56-.15.02-.3.03-.46.03h-2.26A2.8 2.8 0 0 0 14 16.84l.02 2.26Z",
    },
  ],
  // WDSIconIcMic
  mic: [
    {
      d: "M12 14a3 3 0 0 1-2.13-.87A3 3 0 0 1 9 11V5q0-1.25.87-2.12A3 3 0 0 1 12 2q1.25 0 2.12.88Q15 3.75 15 5v6q0 1.25-.88 2.13A3 3 0 0 1 12 14m-1 6v-2.07a6.8 6.8 0 0 1-3.94-1.95 7 7 0 0 1-1.99-3.95A.9.9 0 0 1 6 11q.42 0 .71.29.3.29.39.71a4.8 4.8 0 0 0 1.74 2.88A5 5 0 0 0 12 16q1.8 0 3.17-1.14A5 5 0 0 0 16.9 12q.1-.42.39-.71.29-.3.7-.29a.9.9 0 0 1 .93 1.03 7 7 0 0 1-5.92 5.9V20q0 .42-.29.71-.29.3-.71.29a1 1 0 0 1-.71-.29 1 1 0 0 1-.3-.71m1-8q.42 0 .71-.29.3-.29.29-.71V5q0-.42-.29-.71A1 1 0 0 0 12 4q-.42 0-.71.29-.3.29-.3.71v6q0 .42.3.71.29.3.7.29",
    },
  ],
  // WDSIconWdsIcRead
  read: [
    {
      d: "M14.73 6.01a1 1 0 0 1 1.41-.15l.01.01a1 1 0 0 1 .15 1.41L7.6 18.01a1 1 0 0 1-.73.37h-.05c-.26 0-.52-.11-.71-.3l-4.03-4.09a.99.99 0 0 1 0-1.41.99.99 0 0 1 1.41 0l3.25 3.29 7.99-9.86Zm5.71.12a1 1 0 0 1 1.41-.15h-.01a1 1 0 0 1 .15 1.41l-8.41 10.45a1 1 0 0 1-.73.37h-.05a1 1 0 0 1-.71-.3l-1.36-1.26a.55.55 0 0 1-.02-.81l.56-.68c.21-.2.53-.21.75-.03l.71.58 7.71-9.58Z",
    },
  ],
  // WDSIconIcGroupFilled
  group: [
    {
      d: "M1 17.2c0-.57.15-1.09.44-1.56a2.9 2.9 0 0 1 1.16-1.09 13.76 13.76 0 0 1 9.65-1.16c1.07.26 2.12.64 3.15 1.16.48.25.87.61 1.16 1.09.3.47.44 1 .44 1.56v.8c0 .55-.2 1.02-.59 1.41-.39.4-.86.59-1.41.59H3c-.55 0-1.02-.2-1.41-.59-.4-.39-.59-.86-.59-1.41v-.8ZM18.45 20a3.65 3.65 0 0 0 .55-2v-1a4 4 0 0 0-.61-2.11 5.4 5.4 0 0 0-1.74-1.74 12.61 12.61 0 0 1 4.5 1.4c.6.33 1.06.7 1.38 1.11.31.41.47.86.47 1.34v1c0 .55-.2 1.02-.59 1.41-.39.4-.86.59-1.41.59h-2.55ZM9 12a3.9 3.9 0 0 1-2.83-1.18A3.85 3.85 0 0 1 5 8c0-1.1.4-2.04 1.17-2.83A3.85 3.85 0 0 1 9 4c1.1 0 2.04.4 2.82 1.17A3.85 3.85 0 0 1 13 8c0 1.1-.4 2.04-1.18 2.82A3.85 3.85 0 0 1 9 12Zm10-4c0 1.1-.4 2.04-1.18 2.82a3.85 3.85 0 0 1-3.52 1.12 6.13 6.13 0 0 1-.7-.14A5.95 5.95 0 0 0 15 8a5.76 5.76 0 0 0-1.4-3.8c.23-.08.47-.14.7-.16.23-.03.47-.04.7-.04 1.1 0 2.04.4 2.82 1.17A3.85 3.85 0 0 1 19 8Z",
    },
  ],
} satisfies Record<string, Icon>;

/* tail-in / tail-out (8 x 13): a faint shadow copy one pixel down, then the
 * tail itself in the bubble's colour. */
const TAIL = {
  in: [
    "M1.53 3.57 8 12.19V1H2.81C1.04 1 .47 2.16 1.53 3.57z",
    "M1.53 2.57 8 11.19V0H2.81C1.04 0 .47 1.16 1.53 2.57z",
  ],
  out: [
    "M5.19 1H0v11.2l6.47-8.63C7.53 2.16 6.96 1 5.19 1z",
    "M5.19 0H0v11.2l6.47-8.63C7.53 1.16 6.96 0 5.19 0z",
  ],
} as const;

function Glyph({
  icon,
  size = 24,
  className,
  style,
}: {
  icon: Icon;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
    >
      {icon.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fillRule={p.evenodd ? "evenodd" : undefined}
          clipRule={p.evenodd ? "evenodd" : undefined}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------------ */
/* The people. No photos, so WhatsApp shows initials on a WDS profile colour */
/* pair; the sender names take WhatsApp's group name colours.                */

type Person = {
  name: string;
  initials: string;
  /** Sender name colour in the group. */
  tone: string;
};

/* A contact with no photo gets their initials on WhatsApp's one default
 * pair, light teal with teal letters (Meta's own screenshots, "AC"); only the
 * sender names in a group are coloured per person. */
const INITIALS = { surface: "#B3F5DA", content: "#0A6E56" } as const;

const KAVYA: Person = {
  name: "Kavya Iyer",
  initials: "KI",
  tone: "#7F66FF",
};
const ROHAN: Person = {
  name: "Rohan Mehta",
  initials: "RM",
  tone: "#C58730",
};
const MEERA: Person = {
  name: "Meera Nair",
  initials: "MN",
  tone: "#1DAA61",
};
const ISHAAN: Person = {
  name: "Ishaan Kulkarni",
  initials: "IK",
  tone: "#027EB5",
};

/* ------------------------------------------------------------------------ */

export function WhatsAppPage() {
  return (
    /* `isolate` keeps the header's and composer's z-index inside the page,
     * so ThreeApps' fact card still paints over the composer. */
    <div
      className="absolute inset-0 isolate overflow-hidden"
      style={{ ...WHATSAPP_FONT, background: WA.wallpaper, color: WA.text }}
    >
      <Rail />
      <div
        className="absolute top-0 right-0 bottom-0 overflow-hidden"
        style={{ left: RAIL + 1 }}
      >
        {/* The doodle wallpaper, under the messages and the composer. */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            top: HEADER,
            backgroundColor: WA.wallpaper,
            backgroundImage: `url(${WALLPAPER})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "0 0",
          }}
        />
        {/* The conversation ends at the composer's top edge, as WhatsApp's
            list does, so a message below it is out of view, not behind the
            composer's pill, until the rise scrolls it in. */}
        <div
          className="absolute inset-x-0 top-0 overflow-hidden"
          style={{ bottom: PAGE.height - COMPOSER_TOP }}
        >
          <Messages />
        </div>
        <ChatHeader />
        <Composer />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The navigation rail: Chats (open), Calls, Status, Channels, Communities,  */
/* then Settings and the profile photo at the foot.                          */

function Rail() {
  const items: {
    icon: Icon;
    active?: boolean;
    badge?: string;
    dot?: boolean;
  }[] = [
    { icon: ICON.chatFilled, active: true, badge: "4" },
    { icon: ICON.call },
    { icon: ICON.status },
    { icon: ICON.channels, dot: true },
    { icon: ICON.communities },
  ];
  return (
    <div
      className="absolute top-0 bottom-0 left-0"
      style={{
        width: RAIL,
        background: WA.rail,
        boxShadow: `inset -1px 0 0 ${WA.divider}`,
      }}
    >
      {items.map((it, i) => (
        <RailButton key={i} top={12 + i * 44} {...it} />
      ))}
      <RailDivider top={241} />
      {/* Meta AI, under the tabs' divider, as it ships in India. */}
      <div
        className="absolute flex items-center justify-center"
        style={{ left: 12, top: 255, width: 40, height: 40 }}
      >
        <MetaAiRing />
      </div>

      {/* The foot: Media hub (since November 2025), a divider, Settings and
          the signed-in account's own photo. */}
      <RailButton top={PAGE.height - 162} icon={ICON.media} />
      <RailDivider top={PAGE.height - 108} />
      <RailButton top={PAGE.height - 94} icon={ICON.settings} />
      {/* Set 6px higher and 2px further in than WhatsApp has it, so the fact
          card ThreeApps lays over page x 20 to 500, y 380 to 448 hides it
          whole instead of leaving a dark sliver under its corner. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a plain <img>:
          the deck is a static export with images served as-is. */}
      <img
        src={TEAM.paras.photo}
        alt=""
        className="absolute rounded-full object-cover"
        style={{ left: 20, top: PAGE.height - 50, width: 28, height: 28 }}
      />
    </div>
  );
}

function RailDivider({ top }: { top: number }) {
  return (
    <div
      className="absolute h-px"
      style={{ left: 12, right: 12, top, background: WA.divider }}
    />
  );
}

/* Meta AI's ring (wds-ic-meta-ai-ring's geometry: a 20 unit ring, 2.6 thick,
 * on a 24 grid), painted with the ring's blue, violet and cyan sweep. WhatsApp
 * draws it from a raster asset; a conic gradient through a ring mask is the
 * same picture without one. */
function MetaAiRing() {
  const size = 22;
  const ring = `radial-gradient(circle closest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px), #000 calc(100% - 0.5px), transparent 100%)`;
  return (
    <span
      aria-hidden
      className="block rounded-full"
      style={{
        width: size,
        height: size,
        background:
          "conic-gradient(from 0deg, #4F5BFF, #C04BD6 35deg, #8C63E6 70deg, #1D55F0 105deg, #1A62C8 150deg, #1FB4E6 200deg, #22D0EC 230deg, #1F7FF6 270deg, #0A5BE0 320deg, #4F5BFF)",
        WebkitMaskImage: ring,
        maskImage: ring,
      }}
    />
  );
}

function RailButton({
  top,
  icon,
  active,
  badge,
  dot,
}: {
  top: number;
  icon: Icon;
  active?: boolean;
  badge?: string;
  dot?: boolean;
}) {
  return (
    <div
      className="absolute flex items-center justify-center rounded-full"
      style={{
        left: 12,
        top,
        width: 40,
        height: 40,
        background: active ? WA.railActive : undefined,
        color: active ? WA.text : WA.railIcon,
      }}
    >
      <Glyph icon={icon} />
      {badge && (
        <span
          className="absolute flex items-center justify-center rounded-full text-[11px] leading-none font-medium text-white tabular-nums"
          style={{
            right: -5,
            top: -4,
            minWidth: 19,
            height: 19,
            padding: "0 5px",
            background: WA.branded,
            boxShadow: `0 0 0 2px ${WA.rail}`,
          }}
        >
          {badge}
        </span>
      )}
      {dot && (
        <span
          className="absolute rounded-full"
          style={{
            right: 4,
            top: 5,
            width: 9,
            height: 9,
            background: WA.branded,
            boxShadow: `0 0 0 1.5px ${WA.rail}`,
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The chat header: group photo, name, members, call button, search, menu.  */

function ChatHeader() {
  return (
    <div
      className="absolute inset-x-0 top-0 z-10 flex items-center bg-white"
      style={{
        height: HEADER,
        padding: "10px 12px 10px 16px",
        boxShadow: `0 1px 0 ${WA.divider}`,
      }}
    >
      <span
        className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full"
        style={{ background: "#93D7F5", color: "#027EB5" }}
      >
        <Glyph icon={ICON.group} size={22} />
      </span>
      <div className="ml-[14px] flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[16px] leading-[21px] font-medium">
          BCA Sem VII Div A
        </span>
        <span className="relative truncate text-[14px] leading-[20px]">
          <span style={{ color: WA.muted }}>
            Aarav, Diya, Ishaan, Kavya, Meera, Rohan, You
          </span>
          {/* Covers the members while ThreeApps shows it, if it does. */}
          <span
            className="ta-wa-typing invisible absolute inset-0 bg-white"
            style={{ color: WA.branded }}
          >
            Ishaan is typing…
          </span>
        </span>
      </div>
      {/* The call button opens a voice or video menu: a pill with a caret. */}
      <span
        className="ml-3 flex h-[40px] shrink-0 items-center gap-1 rounded-full pr-[10px] pl-[14px]"
        style={{ boxShadow: `inset 0 0 0 1px rgba(0, 0, 0, 0.2)` }}
      >
        <Glyph icon={ICON.videocam} />
        <Glyph icon={ICON.expandMore} size={20} />
      </span>
      <span className="ml-2 flex h-[40px] w-[40px] shrink-0 items-center justify-center">
        <Glyph icon={ICON.search} />
      </span>
      <span className="flex h-[40px] w-[40px] shrink-0 items-center justify-center">
        <Glyph icon={ICON.more} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The conversation. Bubbles follow WhatsApp's own: 7.5px corners, the first */
/* bubble of a run squares its top corner on the tail's side, text 14.2px on */
/* a 19px line, the time floated into the last line behind a spacer.         */

/* Message row geometry, in panel px. */
const ROW = { avatar: 14, bubble: 52, outRight: 22, maxWidth: 300 } as const;

function Messages() {
  return (
    <div
      className="ta-wa-msgs absolute inset-x-0 flex flex-col"
      // Measured from the list's bottom edge, the composer's top.
      style={{ bottom: COMPOSER_TOP - OLD_BOTTOM - WHATSAPP.lift }}
    >
      <DateChip>Today</DateChip>
      <Incoming
        from={KAVYA}
        time="7:40 am"
        text="Morning! Is the empathy map done?"
      />
      <Incoming
        from={KAVYA}
        time="7:41 am"
        text="We have to pin it up first thing"
        more
      />
      <Incoming
        from={ROHAN}
        time="7:52 am"
        text="Halfway there, will finish it on the bus"
      />
      <Outgoing time="8:02 am" text="Interview notes are in the drive" />
      <Incoming
        from={MEERA}
        time="8:15 am"
        text="Thanks! See you all at 9 in 405"
      />
      {/* Last child, below the others (behind the composer) until the
          rise. */}
      <Incoming
        className="ta-wa-new invisible"
        from={ISHAAN}
        time="8:20 am"
        text="DT is at 3 today, in 701. CR just told us"
      />
    </div>
  );
}

function DateChip({ children }: { children: ReactNode }) {
  return (
    <div className="mb-[12px] flex justify-center">
      <span
        className="rounded-[7.5px] px-3 pt-[5px] pb-[6px] text-[12.5px] leading-[15px]"
        style={{
          background: "rgba(255, 255, 255, 0.9)",
          color: WA.muted,
          boxShadow: WA.bubbleShadow,
        }}
      >
        {children}
      </span>
    </div>
  );
}

function Avatar({ who }: { who: Person }) {
  return (
    <span
      className="absolute top-0 flex h-[28px] w-[28px] items-center justify-center rounded-full text-[11px] leading-none font-medium"
      style={{
        left: ROW.avatar,
        background: INITIALS.surface,
        color: INITIALS.content,
      }}
    >
      {who.initials}
    </span>
  );
}

function Tail({ side, color }: { side: "in" | "out"; color: string }) {
  const [shade, tail] = TAIL[side];
  return (
    <svg
      aria-hidden
      width={8}
      height={13}
      viewBox="0 0 8 13"
      className="absolute top-0"
      style={side === "in" ? { left: -8 } : { right: -8 }}
    >
      <path d={shade} fill="#000" opacity={0.13} />
      <path d={tail} fill={color} />
    </svg>
  );
}

/** Time (and, on yours, the read ticks) floated into the last line. The
 * spacer keeps the text from running under it, as WhatsApp's does. */
function Meta({ time, read }: { time: string; read?: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className="inline-block"
        style={{ width: read ? 70 : 50 }}
      />
      <span
        className="absolute flex items-center text-[11px] leading-[15px] whitespace-nowrap"
        style={{ right: 7, bottom: 4, height: 15, color: WA.muted }}
      >
        {time}
        {read && (
          <Glyph
            icon={ICON.read}
            size={18}
            className="ml-[3px]"
            style={{ color: WA.read }}
          />
        )}
      </span>
    </>
  );
}

function Incoming({
  from,
  time,
  text,
  more,
  className,
}: {
  from: Person;
  time: string;
  text: string;
  /** A follow-up in the same run: no avatar, name or tail. */
  more?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{
        paddingLeft: ROW.bubble,
        marginTop: more ? 4 : RUN_GAP,
      }}
    >
      {!more && <Avatar who={from} />}
      <div
        className="relative w-fit"
        style={{
          maxWidth: ROW.maxWidth,
          background: WA.incoming,
          borderRadius: more ? 7.5 : "0 7.5px 7.5px 7.5px",
          boxShadow: WA.bubbleShadow,
        }}
      >
        {!more && <Tail side="in" color={WA.incoming} />}
        <div className="pt-[6px] pr-[7px] pb-[8px] pl-[9px]">
          {!more && (
            <div
              className="truncate text-[12.8px] leading-[22px] font-medium"
              style={{ color: from.tone, marginTop: -3 }}
            >
              {from.name}
            </div>
          )}
          <div className="text-[14.2px] leading-[19px] break-words">
            {text}
            <Meta time={time} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Outgoing({ time, text }: { time: string; text: string }) {
  return (
    <div
      className="relative flex justify-end"
      style={{ marginTop: RUN_GAP, paddingRight: ROW.outRight }}
    >
      <div
        className="relative w-fit"
        style={{
          maxWidth: ROW.maxWidth,
          background: WA.outgoing,
          borderRadius: "7.5px 0 7.5px 7.5px",
          boxShadow: WA.bubbleShadow,
        }}
      >
        <Tail side="out" color={WA.outgoing} />
        <div className="pt-[6px] pr-[7px] pb-[8px] pl-[9px] text-[14.2px] leading-[19px]">
          {text}
          <Meta time={time} read />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The composer: a white pill floating on the wallpaper.                     */

function Composer() {
  return (
    <div
      className="absolute z-10 flex items-center rounded-full bg-white"
      style={{
        left: COMPOSER.inset,
        right: COMPOSER.inset,
        bottom: COMPOSER.bottom,
        height: COMPOSER.height,
        padding: "0 6px",
      }}
    >
      <span className="flex h-[40px] w-[40px] items-center justify-center">
        <Glyph icon={ICON.add} />
      </span>
      <span className="flex h-[40px] w-[40px] items-center justify-center">
        <Glyph icon={ICON.sticker} />
      </span>
      <span
        className="ml-[7px] flex-1 text-[15px] leading-[20px]"
        style={{ color: WA.muted }}
      >
        Type a message
      </span>
      <span className="flex h-[40px] w-[40px] items-center justify-center">
        <Glyph icon={ICON.mic} />
      </span>
    </div>
  );
}

/* WhatsApp's beige doodle tile (bg-chat-beige, 540 x 960), cropped to the
 * panel below the header (455 x 404) and pre-composited the way WhatsApp
 * paints it: 10% over #F5F1EB. One image, no repeat needed at this size. */
const WALLPAPER =
  "data:image/webp;base64,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";
