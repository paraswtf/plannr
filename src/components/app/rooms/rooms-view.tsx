"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useRouter } from "next/navigation";

import {
  FEATURE_LABELS,
  type RoomFeatureName,
} from "~/components/app/booking/room-fit";
import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { useNow } from "~/components/app/timetable/use-now";
import { Badge } from "~/components/ui/badge";
import { Button, IconButton, buttonClass } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Chip } from "~/components/ui/chip";
import { EmptyState } from "~/components/ui/empty-state";
import { Input } from "~/components/ui/field";
import { Icon } from "~/components/ui/icon";
import { Skeleton } from "~/components/ui/skeleton";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  floorAddress,
  floorLabel,
  floorSections,
  matchesFloor,
  type FloorSection,
} from "./room-floors";
import { RoomDialog, type EditableRoom } from "./room-dialog";
import { RoomPlaque } from "./room-plaque";
import {
  roomStatus,
  type RoomOccurrence,
  type RoomStatus,
} from "./room-status";
import {
  ROOMS_VIEW_COOKIE,
  TYPE_LABEL,
  type RoomsLayout,
  type RoomTypeName,
} from "./room-vocab";

type GridData = RouterOutputs["timetable"]["grid"];
type GridRoom = GridData["rooms"][number];

/**
 * Whether a room answers to what was typed in the search box. One predicate
 * for the in-service list and the archived one, so a search finds the same
 * rooms on both tabs.
 */
function roomMatches(
  room: {
    code: string;
    type: RoomTypeName;
    floor: number;
    building: { name: string };
  },
  needle: string,
): boolean {
  return (
    room.code.toLowerCase().includes(needle) ||
    (TYPE_LABEL[room.type]?.toLowerCase().includes(needle) ?? false) ||
    room.building.name.toLowerCase().includes(needle) ||
    // The floor is a visible axis now, so "ground" and "floor 3" are things
    // somebody will type. Matched by the start of its name and not by
    // substring, or "3" would fetch a whole floor on top of every code
    // containing a 3, see `matchesFloor`.
    matchesFloor(room.floor, needle)
  );
}

/**
 * How wide a room's card is inside a floor's lane.
 *
 * 268px is the width the card was drawn for — the number the flat grid's track
 * minimum still names — and the `min()` is what keeps the peek. A 390px phone
 * has 358px of content and the lane sees 8px past that on the right, its own
 * negative margin, so a 268px card leaves the next one showing 82px of itself
 * past the gap: the whole affordance telling you the lane slides. On a 320px
 * phone that margin would be down to 30px, so below about 344px wide the card
 * gives width back rather than have the peek shrink towards nothing.
 */
const LANE_CARD = "w-[min(268px,78vw)] shrink-0";

/**
 * The same card from `lg` up, where the lane stops sliding and wraps instead
 * (see the lane below): the grid track sizes the card, so the width the phone
 * measured is handed back. Kept apart from `LANE_CARD` so the phone's numbers
 * stay exactly the ones the comment above was worked out for.
 */
const LANE_CARD_DESKTOP = "lg:w-auto";

/**
 * The track the flat grid and the desktop lanes share: one drawing of a room
 * at one width, whichever layout it is standing in. The `min()` is what keeps
 * a 268px card from outgrowing a 358px phone.
 */
const CARD_TRACK = "grid-cols-[repeat(auto-fill,minmax(min(268px,100%),1fr))]";

export function RoomsView({
  initial,
  permissions,
  defaultLayout = "grouped",
}: {
  initial: GridData;
  permissions: string;
  /** The layout the cookie was holding when the page was rendered. */
  defaultLayout?: RoomsLayout;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [query, setQuery] = useState("");
  const [buildingId, setBuildingId] = useState<string | undefined>();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [layout, setLayout] = useState<RoomsLayout>(defaultLayout);
  // Null means the dialog is closed; undefined inside it means "adding".
  const [editing, setEditing] = useState<{ room?: EditableRoom } | null>(null);
  const now = useNow(30_000);

  const bits = new PermissionBitField(BigInt(permissions));
  const canManage = bits.has(PermissionFlags.ManageRooms);
  // Requesting a room and running the estate are different jobs. This screen is
  // open to everybody now, and most of them hold neither.
  const canBook = bits.has(PermissionFlags.BookRoom);

  // Written where the choice is made rather than in an effect: an effect would
  // also fire for the value that has just arrived from the cookie, writing back
  // what was already there on every visit.
  const chooseLayout = (next: RoomsLayout) => {
    setLayout(next);
    document.cookie = `${ROOMS_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  };

  // Archived rooms are not on the timetable at all, so they need their own
  // read; it only runs when the tab asking for them is open.
  const archivedQuery = api.rooms.list.useQuery(
    { includeInactive: true },
    { enabled: canManage && tab === "archived" },
  );
  const archived = (archivedQuery.data?.rows ?? []).filter((r) => !r.isActive);

  const restore = api.rooms.restore.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.timetable.invalidate(),
        utils.rooms.invalidate(),
      ]);
      router.refresh();
    },
  });

  // One query feeds every card: today's occupancy for the whole campus. Each
  // room's badge is derived from it client-side rather than fetched per room.
  const { data } = api.timetable.grid.useQuery(
    { date: new Date(initial.from) },
    {
      initialData: initial,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );

  const timeZone = data?.timeZone ?? "Asia/Kolkata";
  const workingHours =
    ((data?.settings?.dayEndMinutes ?? 1080) -
      (data?.settings?.dayStartMinutes ?? 480)) /
    60;

  const byRoom = useMemo(() => {
    const map = new Map<string, RoomOccurrence[]>();
    for (const o of data?.occurrences ?? []) {
      const entry = {
        roomId: o.roomId,
        start: o.start,
        end: o.end,
        title: o.title,
      };
      const list = map.get(o.roomId);
      if (list) list.push(entry);
      else map.set(o.roomId, [entry]);
    }
    return map;
  }, [data?.occurrences]);

  // Built from every room rather than from the filtered ones, so choosing one
  // building is not the last choice anybody gets to make — the same reasoning
  // the server gives for sending the building list unfiltered.
  const buildings = new Map(
    (data?.rooms ?? []).map((r) => [r.building.id, r.building.name]),
  );

  const needle = query.trim().toLowerCase();
  // Filtered and banded in one pass, and memoised, because the clock behind the
  // status badges re-renders this list twice a minute and neither the search
  // text nor the estate has moved between ticks.
  const { rooms, sections } = useMemo(() => {
    const matches = (data?.rooms ?? []).filter((room) => {
      if (buildingId && room.building.id !== buildingId) return false;
      return !needle || roomMatches(room, needle);
    });
    return { rooms: matches, sections: floorSections(matches) };
  }, [data?.rooms, needle, buildingId]);

  const archivedRooms = archived.filter(
    (room) => !needle || roomMatches(room, needle),
  );

  // Which building a room is in only needs saying while more than one is in
  // play. Read off the estate and the Select rather than off the filtered
  // rooms, so a heading cannot rename itself as somebody types.
  const showBuilding = !buildingId && buildings.size > 1;

  const editRoom = (room: GridRoom) =>
    setEditing({
      room: {
        id: room.id,
        code: room.code,
        buildingId: room.building.id,
        floor: room.floor,
        capacity: room.capacity,
        type: room.type,
        features: room.features,
        notes: room.notes,
      },
    });

  const statusOf = (room: GridRoom) =>
    roomStatus(byRoom.get(room.id) ?? [], now, timeZone, workingHours);

  /**
   * Where a room is, said the same way by the card and by the compact row —
   * the building only while more than one is in play. At a college with one,
   * "SICSR ·" in front of every address is a fact nobody was missing, thirty
   * times over.
   *
   * Floor first, building second: the line truncates on a narrow card, and
   * what an ellipsis should eat is the long building name, not the two
   * characters that say which floor to climb to.
   */
  const whereOf = (room: GridRoom) =>
    showBuilding
      ? `${floorAddress(room.floor)} · ${room.building.name}`
      : floorAddress(room.floor);

  /**
   * The bands, gathered under their building while there is more than one.
   * `floorSections` already hands them back sorted by building and then floor,
   * so this only cuts the run where the building changes; at one-building
   * SICSR it is a single group with no heading, and the page draws exactly
   * what it always did.
   */
  const buildingGroups: Array<{
    id: string;
    name: string;
    sections: Array<FloorSection<GridRoom>>;
  }> = [];
  for (const section of sections) {
    const last = buildingGroups.at(-1);
    if (last?.id === section.building.id) last.sections.push(section);
    else
      buildingGroups.push({
        id: section.building.id,
        name: section.building.name,
        sections: [section],
      });
  }

  const roomCount = (n: number) => (n === 1 ? "1 room" : `${n} rooms`);

  const refresh = async () => {
    await Promise.all([utils.timetable.invalidate(), utils.rooms.invalidate()]);
    router.refresh();
  };

  /**
   * One floor: its heading and its lane. Written once and called from both
   * the single-building page and the one grouped by building, so the two
   * cannot drift into different drawings of the same band. `level` is the
   * heading's rank, which drops by one when a building heading sits above.
   */
  const band = (section: FloorSection<GridRoom>, level: "h2" | "h3") => {
    const count = roomCount(section.rooms.length);
    // The heading, flattened into one string for the reader who
    // arrives at the lane rather than looking at it — the visible
    // version is three elements across a line, and a label read out
    // has to be a sentence.
    const spoken = [
      floorLabel(section.floor),
      showBuilding ? section.building.name : null,
      count,
    ]
      .filter(Boolean)
      .join(", ");
    const Heading = level;

    return (
      <section key={section.key}>
        {/*
         * A heading, not a card: SICSR is many thin floors — a handful
         * of rooms each — and a band whose title costs as much height
         * as the one room under it is worse than no band at all. Not
         * sticky either; the page header above is already sticky at a
         * height that changes with the viewport, and a second sticky
         * band would have to guess its offset.
         *
         * Flush left, with no padding of its own: the lane below
         * cancels its own, so its first card starts at the section's
         * left edge, and an inset here would leave the floor's name
         * standing a few pixels to the right of the rooms on it.
         *
         * 16px at a 1.4 line comes to the same 22.4px line the old 15px
         * heading had, so the lane's scroll margin below still holds.
         */}
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <Heading className="font-display text-title text-md font-semibold tracking-[-0.01em]">
            {floorLabel(section.floor)}
          </Heading>
          <span className="text-faint ml-auto font-mono text-xs tabular-nums">
            {count}
          </span>
        </div>

        {/*
         * A floor is a corridor, so on a phone it is one row you read
         * across rather than a block you read down — the lane slides
         * inside itself instead of wrapping, which is what keeps a
         * seven-room floor one swipe rather than seven screens. The
         * next card peeking past the edge is the cue that it slides.
         *
         * From `lg` up it wraps into the flat grid's track instead. A
         * desktop lane is exactly four cards wide at 1440, so a fifth room
         * sat wholly past the edge with no peek and no scrollbar: the
         * heading said five rooms and the eye saw four. On a wide screen
         * the whole floor fits in two rows, so nothing needs hiding.
         *
         * The padding and the negative margin that cancels it are the
         * same pair the tab strip uses: a box that scrolls on one axis
         * clips the other, and 8px is what the cards' shadow needs to
         * survive the crop.
         */}
        <div
          /*
           * Most people on this screen hold neither BookRoom nor
           * ManageRooms, so their cards contain nothing focusable and
           * tabbing would never reach inside the lane — which is the
           * one thing sliding a floor sideways could take away that
           * wrapping it could not. Focusable, so the arrow keys move
           * it; named, so what has been landed on announces itself as
           * the floor rather than as a box. From `lg` up the lane wraps
           * and there is nothing to scroll, but the stop stays: it is
           * still how a keyboard hears which floor it has arrived on.
           */
          tabIndex={0}
          role="group"
          aria-label={spoken}
          /*
           * Focusing the lane provokes a scroll to it, and the
           * browser counts nothing that is stuck to the top of the
           * page. 96px is what the people list already stops short of
           * the sticky header by; the other 30 are this floor's own
           * heading, so tabbing back up a floor arrives at a lane
           * that still has its name above it rather than at cards
           * sitting under the header.
           */
          style={{ scrollMarginTop: "calc(var(--topbar-h) + 126px)" }}
          // The `lg:` track is `CARD_TRACK` written out again rather than
          // derived from it: Tailwind only builds classes it can read whole
          // in the source.
          className="plr-scroll -m-2 flex gap-4 overflow-x-auto overscroll-x-contain p-2 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(min(268px,100%),1fr))] lg:overflow-visible"
        >
          {section.rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              status={statusOf(room)}
              canManage={canManage}
              canBook={canBook}
              onEdit={() => editRoom(room)}
              // No address on a card inside a band: the heading right above
              // it already names the floor (and the building, when there is
              // more than one), and "floor 4" under "Floor 4" only repeated it.
              className={`${LANE_CARD} ${LANE_CARD_DESKTOP}`}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <>
      <PageHeader
        title="Rooms"
        subtitle={
          canBook
            ? "Browse spaces and reserve one"
            : "Browse spaces and see what is free"
        }
        actions={
          canManage && (
            // Slate, not the brand gradient: this is the one thing the page
            // does for the people who run the estate, and white type on the
            // gradient's orange end fell to about 2:1.
            <Button
              variant="primary"
              icon="plus"
              onClick={() => setEditing({})}
            >
              Add room
            </Button>
          )
        }
      />
      <PageBody>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {canManage && (
            <Segmented
              items={[
                { value: "active" as const, label: "In service" },
                { value: "archived" as const, label: "Archived" },
              ]}
              value={tab}
              onChange={setTab}
              size="sm"
              ariaLabel="Which rooms to show"
            />
          )}
          <Input
            icon="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // The placeholder says what to type; the name says what the box
            // is, for a reader who never sees the placeholder.
            aria-label="Search rooms"
            placeholder="Search rooms…"
            className="w-full sm:w-64"
          />
          {/*
           * Only while there is a choice to make. At one-building SICSR the
           * list held "All buildings" and nothing else, and on a phone it
           * cost a full row of controls above the first room to say so.
           */}
          {tab === "active" && buildings.size > 1 && (
            <Select
              ariaLabel="Building"
              className="w-full sm:w-auto"
              value={buildingId ?? ""}
              options={[
                { value: "", label: "All buildings" },
                ...[...buildings].map(([id, name]) => ({
                  value: id,
                  label: name,
                })),
              ]}
              onChange={(id) => setBuildingId(id || undefined)}
            />
          )}
          {/*
           * How the list is drawn, rather than what is in it, so it sits after
           * every control that changes the set and beside the count of what
           * came back. It rides with the count as one flex item because the two
           * pill strips come to about 343px against the 358px a phone has:
           * side by side they would not wrap, they would each shrink into their
           * own scroll box and clip the pill that is lit.
           */}
          <div className="ml-auto flex items-center gap-3">
            {tab === "active" && (
              <Segmented
                items={[
                  { value: "grouped" as const, label: "Grouped" },
                  { value: "compact" as const, label: "Compact" },
                ]}
                value={layout}
                onChange={chooseLayout}
                size="sm"
                ariaLabel="Room list layout"
              />
            )}
            <span className="text-faint font-mono text-xs tabular-nums">
              {tab === "active"
                ? `${rooms.length} rooms`
                : `${archivedRooms.length} archived`}
            </span>
          </div>
        </div>

        {tab === "archived" ? (
          <ArchivedRooms
            rooms={archivedRooms}
            searching={archived.length > 0}
            loading={archivedQuery.isLoading}
            restoring={restore.isPending ? restore.variables?.id : undefined}
            onRestore={(id) => restore.mutate({ id })}
          />
        ) : layout === "compact" ? (
          <CompactRooms
            // Already in floor order, because the bands are: this is the same
            // list the grouped view draws, read straight through.
            rooms={sections.flatMap((section) => section.rooms)}
            statusOf={statusOf}
            whereOf={whereOf}
            canManage={canManage}
            canBook={canBook}
            onEdit={editRoom}
          />
        ) : sections.length > 1 ? (
          showBuilding ? (
            /*
             * More than one building: the building is the bigger container,
             * so it is the bigger heading, said once, with its floors under
             * it. Drawn as a suffix on every floor instead, "Floor 1" turned
             * up twice at the same weight and the page read as one building
             * with its floors listed twice.
             */
            <div className="flex flex-col gap-10">
              {buildingGroups.map((group) => (
                <section key={group.id} className="flex flex-col gap-4">
                  <div className="flex items-baseline gap-2.5 pb-2 shadow-[0_1px_0_var(--hair-soft)]">
                    <h2 className="font-display text-title text-lg font-semibold tracking-[-0.015em]">
                      {group.name}
                    </h2>
                    <span className="text-faint ml-auto font-mono text-xs tabular-nums">
                      {roomCount(
                        group.sections.reduce(
                          (n, section) => n + section.rooms.length,
                          0,
                        ),
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col gap-6">
                    {group.sections.map((section) => band(section, "h3"))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {sections.map((section) => band(section, "h2"))}
            </div>
          )
        ) : (
          /*
           * One band is no band. It happens on a search that lands inside a
           * single floor, and — the case that matters — on an estate whose room
           * codes the importer could not read a floor out of, which puts every
           * room on floor 0. A lane there would be one endless sideways scroll
           * under a heading claiming they are all on the ground.
           */
          <div className={`grid ${CARD_TRACK} gap-4`}>
            {rooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                status={statusOf(room)}
                canManage={canManage}
                canBook={canBook}
                onEdit={() => editRoom(room)}
                where={whereOf(room)}
              />
            ))}
          </div>
        )}

        {tab === "active" && rooms.length === 0 && (
          <Card pad={0}>
            {(data?.rooms ?? []).length === 0 ? (
              <EmptyState
                icon="door"
                title="No rooms yet"
                action={
                  // Secondary: the header's Add room is already the page's
                  // one primary, and this is the same action said again where
                  // the eye has landed.
                  canManage && (
                    <Button icon="plus" onClick={() => setEditing({})}>
                      Add room
                    </Button>
                  )
                }
              >
                {canManage
                  ? "Rooms added here can be booked and timetabled."
                  : "Rooms turn up here once they have been added."}
              </EmptyState>
            ) : (
              /*
               * The likeliest dead end on a page driven by a search box, so it
               * says what was searched for and offers the way back out, rather
               * than one muted sentence in an empty card.
               */
              <EmptyState
                icon="search"
                title={
                  needle
                    ? `No rooms match “${query.trim()}”`
                    : "No rooms in this building"
                }
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {needle && (
                      <Button size="sm" onClick={() => setQuery("")}>
                        Clear search
                      </Button>
                    )}
                    {buildingId && (
                      <Button
                        size="sm"
                        onClick={() => setBuildingId(undefined)}
                      >
                        Show all buildings
                      </Button>
                    )}
                  </div>
                }
              >
                Search by room number, type, building or floor, like “floor 3”.
              </EmptyState>
            )}
          </Card>
        )}
      </PageBody>

      {editing && (
        <RoomDialog
          room={editing.room}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

/**
 * One room, at full size — the same card whether it is standing in a floor's
 * lane or in the flat grid, so the two layouts cannot drift into being two
 * different drawings of the same room.
 */
function RoomCard({
  room,
  status,
  canManage,
  canBook,
  onEdit,
  where,
  className = "",
}: {
  room: GridRoom;
  status: RoomStatus;
  canManage: boolean;
  canBook: boolean;
  onEdit: () => void;
  /**
   * Where the room is, in words. Handed in rather than built here so it is
   * settled once for the whole screen — see `whereOf` — and so the line and the
   * tooltip that recovers it when it truncates cannot come to disagree. Left
   * out inside a floor's band, whose heading already says it.
   */
  where?: string;
  /** What sizes the card where its container will not — the lane's width. */
  className?: string;
}) {
  const booked = Math.round(status.load * 100);

  return (
    <Card pad={18} className={`flex flex-col gap-3 ${className}`}>
      {/*
       * The identity block. The number is the entire reason anybody opened this
       * page — "where is 403?" — so it gets a plate of its own, and everything
       * else arranges itself around it: a manager's edit button in the corner
       * beside it, the address (where there is one) at the foot of that
       * column, level with the plate.
       *
       * The status used to stand in that column too, and a plate wide enough
       * for a named room plus a `booked soon` badge plus the edit button did
       * not fit on one line, so T-Studio's badge wrapped under its plate and
       * the badges stopped lining up across the lane. Moved under the plate,
       * the status sits at the same height on every card whatever the room is
       * called, and the plate never has to give up width to it — a shrunken
       * number is the one thing this whole layout exists to stop.
       */}
      <div className="flex items-start gap-3">
        <RoomPlaque code={room.code} />
        <div className="flex min-w-0 flex-1 flex-col items-end justify-between gap-2 self-stretch">
          {canManage ? (
            <IconButton
              icon="settings"
              label={`Edit ${room.code}`}
              size="sm"
              onClick={onEdit}
              // Pulled into the card's corner, so its hover wash lines up
              // with the padding rather than floating inside it.
              className="-mt-1.5 -mr-1.5"
            />
          ) : (
            <span />
          )}
          {where && (
            <div
              title={where}
              className="text-muted w-full truncate text-right text-xs"
            >
              {where}
            </div>
          )}
        </div>
      </div>

      {/*
       * The second answer the page is for, "can I go in, and until when", set
       * as one block: the badge, then the sentence that explains it in body
       * ink. It used to be the faintest line on the card while the load bar
       * under it was the darkest thing after the plate.
       */}
      <div className="flex flex-col items-start gap-1.5">
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        <p className="text-ink text-sm">{status.line}</p>
      </div>

      {/*
       * The type as plain words, not a badge: drawn as a tinted chip it was
       * indistinguishable from the features beside it, and "Lecture" read as
       * one more piece of kit.
       */}
      <p className="text-muted flex items-center gap-1.5 text-sm">
        <Icon name="users" size={14} className="shrink-0" />
        <span className="min-w-0 truncate">
          {TYPE_LABEL[room.type] ?? room.type} · {room.capacity} seats
        </span>
      </p>

      {room.features.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Features">
          {room.features.map((f) => (
            <li key={f} className="max-w-full">
              <Chip>{FEATURE_LABELS[f] ?? f}</Chip>
            </li>
          ))}
        </ul>
      )}

      {/*
       * How much of today's working day is booked. Real data, so it stays, but
       * quieter than it was — a hairline-weight track — and with its number
       * beside it, since a bar on its own told nobody what it measured.
       */}
      <div
        className="mt-auto flex items-center gap-2.5 pt-1"
        title={`Booked for ${booked}% of today's working hours`}
      >
        <div
          role="meter"
          aria-label="Booked today"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={booked}
          aria-valuetext={`${booked}% of today booked`}
          className="bg-tint-strong h-1 flex-1 overflow-hidden rounded-full"
        >
          <div
            className="bg-slate h-full rounded-full"
            style={{ width: `${booked}%` }}
          />
        </div>
        <span
          aria-hidden
          className="text-faint text-2xs w-[4.5rem] text-right font-mono tabular-nums"
        >
          {booked}% booked
        </span>
      </div>

      {/*
       * /book is itself behind BookRoom, so offering this to somebody without
       * it is a link that bounces them home. The card is complete without it —
       * the occupancy block above carries `mt-auto` and stays pinned to the
       * bottom either way.
       *
       * A ghost button rather than a bare link, so it has a hover, a press and
       * a thumb-sized target; pulled left by its own padding so its words still
       * start on the card's edge with everything else.
       */}
      {canBook && (
        <Link
          href={`/book?room=${room.id}`}
          className={buttonClass("ghost", "sm", "-mb-1 -ml-3 self-start")}
        >
          Book this room
          <Icon name="arrowRight" size={14} stroke={2} />
        </Link>
      )}
    </Card>
  );
}

/**
 * Every room at once, a line each.
 *
 * The banded view answers "what is on the third floor"; this one answers "show
 * me the lot" — a whole campus on one screen instead of four rooms and a
 * scrollbar. It keeps the floor order the bands are in and says the floor on
 * every line, so nothing is lost by the headings going away; what it gives up
 * is the features list and the load bar, neither of which survives being made
 * a quarter the size.
 */
function CompactRooms({
  rooms,
  statusOf,
  whereOf,
  canManage,
  canBook,
  onEdit,
}: {
  rooms: GridRoom[];
  statusOf: (room: GridRoom) => RoomStatus;
  /** Where a room is, in the same words the cards put under the number. */
  whereOf: (room: GridRoom) => string;
  canManage: boolean;
  canBook: boolean;
  onEdit: (room: GridRoom) => void;
}) {
  if (rooms.length === 0) return null;

  return (
    <Card pad={0}>
      {rooms.map((room, i) => {
        const status = statusOf(room);
        // What the room is and where it is, as two cells rather than one
        // line. Kept apart, the seat count (what somebody looking for a room
        // scans this list for) never shares a truncating box with a long
        // building name, and neither line carries more than its one dot.
        const kind = `${TYPE_LABEL[room.type] ?? room.type}, ${room.capacity} seats`;
        const where = whereOf(room);

        return (
          <div
            key={room.id}
            /*
             * A phone wraps the row onto as many lines as it needs. From `lg`
             * up it is a table: fixed columns for the plate and the badge, so
             * the plates form one column and the statuses another rather than
             * the badge wandering with the width of whatever came before it,
             * and the text columns share what is left. The kind of room gets
             * a fixed 10rem too, so it is never the one cut short: the types
             * are a closed set, and the longest line they make ("Lecture
             * hall, 1200 seats") is about 140px. Fixed rather than
             * `max-content`, because every row is a grid of its own, and a
             * track sized by its content would start the next column
             * somewhere different on every line. The address and the class
             * in there split the rest, and only they truncate.
             */
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 lg:grid lg:grid-cols-[8.5rem_7rem_10rem_minmax(0,0.75fr)_minmax(0,1.5fr)_auto] lg:gap-x-4"
            style={
              i > 0
                ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" }
                : undefined
            }
          >
            {/*
             * The archived list's plate, for the reason it gives there. Each
             * of these two sits in a box of its own so that, as grid cells,
             * the plate and the badge keep their drawn width instead of
             * stretching to the column's.
             */}
            <div className="flex min-w-0">
              <RoomPlaque code={room.code} scale="row" />
            </div>
            <div className="flex min-w-0">
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
            </div>
            <span className="text-muted text-sm lg:whitespace-nowrap">
              {kind}
            </span>
            {/*
             * Floor first and building second, so on a narrow table it is
             * the building name an ellipsis eats, as on the cards.
             */}
            <span title={where} className="text-muted text-sm lg:truncate">
              {where}
            </span>
            {/*
             * What the badge cannot fit: which class is in there, and until
             * when.
             *
             * The 180px is a wrapping threshold, not a width. Given a basis of
             * zero this would be handed whatever was left of the line it landed
             * on — on a phone that is the forty pixels after the plate and the
             * badge, and "MCA-I Data Structures · until 15:30" arrives as one
             * ellipsis. Asking for 180px means it drops to a line of its own
             * instead, where it has the whole row to grow into; `min-w-0` is
             * what still lets it give way on a screen narrower than that. It
             * truncates, so it carries a `title` to recover it.
             */}
            <span
              title={status.line}
              className="text-ink min-w-0 flex-1 basis-[180px] truncate text-sm"
            >
              {status.line}
            </span>

            {/*
             * Nothing at all for most people, who hold neither permission — and
             * an empty span still costs the row a gap and, once it has wrapped,
             * a line.
             */}
            {(canBook || canManage) && (
              <span className="ml-auto flex shrink-0 items-center gap-1 lg:justify-self-end">
                {canBook && (
                  <Link
                    href={`/book?room=${room.id}`}
                    aria-label={`Book ${room.code}`}
                    className={buttonClass("ghost", "sm")}
                  >
                    Book
                    <Icon name="arrowRight" size={14} stroke={2} />
                  </Link>
                )}
                {canManage && (
                  <IconButton
                    icon="settings"
                    label={`Edit ${room.code}`}
                    size="sm"
                    onClick={() => onEdit(room)}
                  />
                )}
              </span>
            )}
          </div>
        );
      })}
    </Card>
  );
}

/**
 * Rooms out of service. Deliberately plainer than the cards: there is no
 * occupancy to show for a room nothing can be booked into, so the only question
 * left is whether to bring it back.
 */
function ArchivedRooms({
  rooms,
  searching,
  loading,
  restoring,
  onRestore,
}: {
  rooms: Array<{
    id: string;
    code: string;
    capacity: number;
    type: RoomTypeName;
    features: RoomFeatureName[];
    building: { name: string };
  }>;
  /** Some rooms are archived, so an empty list means the search found none. */
  searching: boolean;
  loading: boolean;
  /** The room currently being put back, if any. */
  restoring?: string;
  onRestore: (id: string) => void;
}) {
  if (loading) {
    // Three rows the shape of the ones on their way: plate, a line of facts,
    // the button. Nothing moves when the real rows replace them.
    return (
      <Card pad={0}>
        <div role="status" aria-label="Loading archived rooms">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3"
              style={
                i > 0
                  ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" }
                  : undefined
              }
            >
              <Skeleton className="h-9 w-11 rounded-[9px] sm:w-[72px]" />
              <Skeleton className="h-3.5 w-48 max-w-[40%]" />
              <Skeleton className="ml-auto h-8 w-36 rounded-[var(--radius-btn)]" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (rooms.length === 0 && searching) {
    return (
      <Card pad={0}>
        <EmptyState icon="inbox" title="No archived rooms match" compact>
          Try a different room, building, type or floor.
        </EmptyState>
      </Card>
    );
  }

  if (rooms.length === 0) {
    return (
      <Card pad={0}>
        <EmptyState icon="inbox" title="Nothing archived" compact>
          Rooms taken out of service turn up here.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card pad={0}>
      {rooms.map((room, i) => (
        <div
          key={room.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3"
          style={
            i > 0 ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" } : undefined
          }
        >
          {/*
           * The same plate as the cards, at row scale, so an archived room
           * reads as the same object at rest rather than a different one. The
           * `sm:` minimum is what lines the plates into a column and lets the
           * row read as a table — on a phone the row is three stacked lines and
           * a fixed width in front of the first only wastes what little there
           * is. 72px of plate is optically the 90px of bare text it replaces,
           * because the plate carries its own padding.
           */}
          <RoomPlaque code={room.code} scale="row" />
          <span className="text-muted text-sm">
            {room.building.name} · {TYPE_LABEL[room.type] ?? room.type},{" "}
            {room.capacity} seats
          </span>
          {room.features.length > 0 && (
            <span className="text-faint truncate text-xs">
              {room.features.map((f) => FEATURE_LABELS[f] ?? f).join(", ")}
            </span>
          )}
          <Button
            size="sm"
            disabled={restoring === room.id}
            onClick={() => onRestore(room.id)}
            className="ml-auto"
          >
            {restoring === room.id ? "Restoring…" : "Put back in service"}
          </Button>
        </div>
      ))}
    </Card>
  );
}
