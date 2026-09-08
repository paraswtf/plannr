"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useRouter } from "next/navigation";

import {
  FEATURE_LABELS,
  type RoomFeatureName,
} from "~/components/app/booking/room-fit";
import { PageHeader } from "~/components/app/shell/page-header";
import { useNow } from "~/components/app/timetable/use-now";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  floorAddress,
  floorLabel,
  floorSections,
  matchesFloor,
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
      if (!needle) return true;
      return (
        room.code.toLowerCase().includes(needle) ||
        (TYPE_LABEL[room.type]?.toLowerCase().includes(needle) ?? false) ||
        room.building.name.toLowerCase().includes(needle) ||
        // The floor is a visible axis now, so "ground" and "floor 3" are things
        // somebody will type. Matched by the start of its name and not by
        // substring, or "3" would fetch a whole floor on top of every code
        // containing a 3 — see `matchesFloor`.
        matchesFloor(room.floor, needle)
      );
    });
    return { rooms: matches, sections: floorSections(matches) };
  }, [data?.rooms, needle, buildingId]);

  const archivedRooms = archived.filter(
    (room) =>
      !needle ||
      room.code.toLowerCase().includes(needle) ||
      room.building.name.toLowerCase().includes(needle),
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
   */
  const whereOf = (room: GridRoom) =>
    showBuilding
      ? `${room.building.name} · ${floorAddress(room.floor)}`
      : floorAddress(room.floor);

  const refresh = async () => {
    await Promise.all([utils.timetable.invalidate(), utils.rooms.invalidate()]);
    router.refresh();
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
            <button
              type="button"
              onClick={() => setEditing({})}
              className="inline-flex min-h-10 cursor-pointer items-center rounded-[var(--radius-btn)] px-3.5 text-[13px] font-semibold text-white lg:min-h-0 lg:py-2"
              style={{ background: "var(--grad-brand)" }}
            >
              + Add room
            </button>
          )
        }
      />
      <div className="px-4 pt-2 pb-8 sm:px-6 lg:px-9 lg:pb-10">
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
          <div className="relative w-full sm:w-60">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
              <Icon name="search" size={15} color="var(--faint)" />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rooms…"
              className="bg-surface w-full rounded-[10px] py-2.5 pr-3 pl-9 text-[16px] outline-none sm:text-[13.5px] lg:py-2"
              style={{ boxShadow: "var(--ring)" }}
            />
          </div>
          {tab === "active" && (
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
            <span className="text-faint font-mono text-[12px]">
              {tab === "active"
                ? `${rooms.length} rooms`
                : `${archivedRooms.length} archived`}
            </span>
          </div>
        </div>

        {tab === "archived" ? (
          <ArchivedRooms
            rooms={archivedRooms}
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
          <div className="flex flex-col gap-6">
            {sections.map((section) => {
              const count =
                section.rooms.length === 1
                  ? "1 room"
                  : `${section.rooms.length} rooms`;
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
                   */}
                  <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <h2 className="font-display text-title text-[15px] font-bold">
                      {floorLabel(section.floor)}
                    </h2>
                    {showBuilding && (
                      <span className="text-muted text-[12.5px]">
                        {section.building.name}
                      </span>
                    )}
                    <span className="text-faint ml-auto font-mono text-[12px]">
                      {count}
                    </span>
                  </div>

                  {/*
                   * A floor is a corridor, so it is one row you read across
                   * rather than a block you read down — the lane slides inside
                   * itself instead of wrapping, which is what keeps a seven-room
                   * floor one swipe rather than seven screens on a phone.
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
                     * the floor rather than as a box.
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
                    className="plr-scroll -m-2 flex gap-4 overflow-x-auto overscroll-x-contain p-2"
                  >
                    {section.rooms.map((room) => (
                      <RoomCard
                        key={room.id}
                        room={room}
                        status={statusOf(room)}
                        canManage={canManage}
                        canBook={canBook}
                        onEdit={() => editRoom(room)}
                        where={whereOf(room)}
                        className={LANE_CARD}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          /*
           * One band is no band. It happens on a search that lands inside a
           * single floor, and — the case that matters — on an estate whose room
           * codes the importer could not read a floor out of, which puts every
           * room on floor 0. A lane there would be one endless sideways scroll
           * under a heading claiming they are all on the ground.
           *
           * The `min()` is what keeps a 268px card from outgrowing a 358px
           * phone: below that width the track collapses to the column itself.
           */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(268px,100%),1fr))] gap-4">
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
          <Card>
            <p className="text-muted m-0 text-[14px]">
              {(data?.rooms ?? []).length === 0
                ? "No rooms yet."
                : "No rooms match that search."}
            </p>
          </Card>
        )}
      </div>

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
   * tooltip that recovers it when it truncates cannot come to disagree.
   */
  where: string;
  /** What sizes the card where its container will not — the lane's width. */
  className?: string;
}) {
  return (
    <Card pad={18} className={`flex flex-col gap-3 ${className}`}>
      {/*
       * The identity block. The number is the entire reason anybody opened this
       * page — "where is 403?" — so it gets a plate of its own, and everything
       * else arranges itself around it: the live status at the top of the
       * column beside it, the address at the foot of that column, level with
       * the plate.
       *
       * The band wraps rather than compresses. On the narrowest track a card
       * has 232px of content — 214px in a lane on a 320px phone, which is
       * narrower still — and a plate wide enough for a named room plus a
       * `booked soon` badge plus a manager's edit chip do not all fit on one
       * line; the minimum on the column is what makes the row drop it onto a
       * line of its own instead of squeezing either the number or the status
       * label. A taller card is a fine outcome — a shrunken number is the one
       * thing this whole layout exists to stop.
       */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <RoomPlaque code={room.code} />
        <div className="flex min-w-[124px] flex-1 flex-col items-end justify-between gap-2 self-stretch">
          <div className="flex items-center gap-1.5">
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
            {canManage && (
              <button
                type="button"
                aria-label={`Edit ${room.code}`}
                onClick={onEdit}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-7 lg:w-7"
                style={{ background: "rgba(68,88,121,0.07)" }}
              >
                <Icon
                  name="settings"
                  size={13}
                  color="var(--slate)"
                  stroke={2}
                />
              </button>
            )}
          </div>
          <div
            title={where}
            className="text-muted w-full truncate text-right text-[12.5px]"
          >
            {where}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge tone="slate">{TYPE_LABEL[room.type] ?? room.type}</Badge>
        <span className="text-muted inline-flex items-center gap-1.5 text-[12.5px]">
          <Icon name="users" size={13} color="var(--muted)" />
          {room.capacity} seats
        </span>
      </div>

      {room.features.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {room.features.map((f) => (
            <span
              key={f}
              className="text-muted rounded-md px-2 py-1 text-[11px] font-semibold"
              style={{ background: "rgba(68,88,121,0.07)" }}
            >
              {FEATURE_LABELS[f] ?? f}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-1">
        <div
          className="mb-2 h-1.5 overflow-hidden rounded-full"
          style={{ background: "rgba(68,88,121,0.12)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(status.load * 100)}%`,
              background: "var(--slate)",
            }}
          />
        </div>
        <div className="text-faint text-[12px]">{status.line}</div>
      </div>

      {/*
       * /book is itself behind BookRoom, so offering this to somebody without
       * it is a link that bounces them home. The card is complete without it —
       * the occupancy block above carries `mt-auto` and stays pinned to the
       * bottom either way.
       */}
      {canBook && (
        <Link
          href={`/book?room=${room.id}`}
          className="text-slate inline-flex min-h-10 items-center gap-1.5 self-start text-[13px] font-bold lg:min-h-0"
        >
          Book this room
          <Icon name="arrowRight" size={15} color="var(--slate)" />
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

        return (
          <div
            key={room.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5"
            style={
              i > 0
                ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" }
                : undefined
            }
          >
            {/* The archived list's plate, for the reason it gives there. */}
            <RoomPlaque code={room.code} scale="row" />
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
            <span className="text-muted text-[12.5px]">
              {whereOf(room)} · {TYPE_LABEL[room.type] ?? room.type} ·{" "}
              {room.capacity} seats
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
             * what still lets it give way on a screen narrower than that. It is
             * the one thing here that truncates, so it is the one thing that
             * carries a `title` to recover it.
             */}
            <span
              title={status.line}
              className="text-faint min-w-0 flex-1 basis-[180px] truncate text-[11.5px]"
            >
              {status.line}
            </span>

            {/*
             * Nothing at all for most people, who hold neither permission — and
             * an empty span still costs the row a gap and, once it has wrapped,
             * a line.
             */}
            {(canBook || canManage) && (
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {canBook && (
                  <Link
                    href={`/book?room=${room.id}`}
                    aria-label={`Book ${room.code}`}
                    className="text-slate inline-flex min-h-10 items-center gap-1 text-[12.5px] font-bold lg:min-h-0"
                  >
                    Book
                    <Icon name="arrowRight" size={14} color="var(--slate)" />
                  </Link>
                )}
                {canManage && (
                  <button
                    type="button"
                    aria-label={`Edit ${room.code}`}
                    onClick={() => onEdit(room)}
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-7 lg:w-7"
                    style={{ background: "rgba(68,88,121,0.07)" }}
                  >
                    <Icon
                      name="settings"
                      size={13}
                      color="var(--slate)"
                      stroke={2}
                    />
                  </button>
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
  loading: boolean;
  /** The room currently being put back, if any. */
  restoring?: string;
  onRestore: (id: string) => void;
}) {
  if (loading) {
    return (
      <Card>
        <p className="text-muted m-0 text-[14px]">Looking…</p>
      </Card>
    );
  }

  if (rooms.length === 0) {
    return (
      <Card>
        <p className="text-muted m-0 text-[14px]">
          Nothing archived. Rooms taken out of service turn up here.
        </p>
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
          <span className="text-muted text-[12.5px]">
            {room.building.name} · {TYPE_LABEL[room.type] ?? room.type} ·{" "}
            {room.capacity} seats
          </span>
          {room.features.length > 0 && (
            <span className="text-faint truncate text-[11.5px]">
              {room.features.map((f) => FEATURE_LABELS[f] ?? f).join(", ")}
            </span>
          )}
          <button
            type="button"
            disabled={restoring === room.id}
            onClick={() => onRestore(room.id)}
            className="text-slate ml-auto inline-flex min-h-10 cursor-pointer items-center rounded-lg px-3 text-[12.5px] font-semibold lg:min-h-0 lg:py-1.5"
            style={{ boxShadow: "var(--ring)" }}
          >
            {restoring === room.id ? "Restoring…" : "Put back in service"}
          </button>
        </div>
      ))}
    </Card>
  );
}
