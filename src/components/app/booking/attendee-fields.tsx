"use client";

import { facultyCard, groupCard } from "~/components/app/people/entity-cards";
import { Icon } from "~/components/ui/icon";
import {
  EntityPicker,
  pickerPage,
  SearchSelect,
} from "~/components/ui/entity-picker";
import type { BookingDraft } from "./use-booking-draft";

/**
 * Who a scheduled session is for. Only shown to people who schedule for others
 * — a self-serve booking is implicitly for the person making it.
 */
export function AttendeeFields({
  draft,
  className = "grid gap-3 sm:grid-cols-2",
}: {
  draft: BookingDraft;
  className?: string;
}) {
  const { group, groupsPage, groupFaculty, facultyPage, selectedFaculty } =
    draft;

  return (
    <div className={className}>
      <div className="flex flex-col gap-1.5">
        <span className="text-ink text-[13px] font-semibold">
          Class / group
        </span>
        <SearchSelect
          value={group ? groupCard(group) : null}
          onChange={draft.setGroupId}
          page={pickerPage(groupsPage.data, (rows) => rows.map(groupCard))}
          loading={groupsPage.isLoading}
          query={draft.groupQuery}
          onQueryChange={draft.setGroupQuery}
          onLoadMore={draft.loadMoreGroups}
          placeholder="Search groups…"
          listId="booking-group"
          emptyOption="No group"
        />
        {draft.needsGroup && (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#b02636]">
            <Icon name="alert" size={12} color="var(--red)" stroke={2.4} />A
            class needs a group attending it.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-ink text-[13px] font-semibold">Faculty</span>
        <SearchSelect
          value={selectedFaculty ? facultyCard(selectedFaculty) : null}
          onChange={draft.setFacultyId}
          page={
            // The class's own teachers, until somebody searches for a stand-in.
            groupFaculty.length && !draft.facultyQuery.trim()
              ? {
                  rows: groupFaculty.map(
                    (f: {
                      id: string;
                      name: string;
                      department?: string | null;
                    }) =>
                      facultyCard({ ...f, department: f.department ?? null }),
                  ),
                  total: groupFaculty.length,
                  hasMore: false,
                }
              : pickerPage(facultyPage.data, (rows) => rows.map(facultyCard))
          }
          loading={facultyPage.isLoading}
          query={draft.facultyQuery}
          onQueryChange={draft.setFacultyQuery}
          onLoadMore={draft.loadMoreFaculty}
          placeholder="Search faculty…"
          listId="booking-faculty"
          emptyOption="No faculty"
        />
      </div>

      {/*
       * A lecture given to two sections at once is one event with both groups
       * on it, not two bookings of the same room — the room only has to fit
       * once, and the register is taken per group.
       */}
      {draft.groupId && (
        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">
            Also attending
          </span>
          <EntityPicker
            selected={draft.extraGroups.map(groupCard)}
            onChange={draft.setExtraGroupIds}
            page={pickerPage(draft.groupsPage.data, (rows) =>
              rows
                // The primary group is already in the room.
                .filter((g) => g.id !== draft.groupId)
                .map(groupCard),
            )}
            loading={draft.groupsPage.isLoading}
            query={draft.groupQuery}
            onQueryChange={draft.setGroupQuery}
            onLoadMore={draft.loadMoreGroups}
            placeholder="Add another group…"
            emptyLabel="Just this group"
          />
        </div>
      )}
    </div>
  );
}
