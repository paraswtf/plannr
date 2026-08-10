"use client";

import { facultyCard, groupCard } from "~/components/app/people/entity-cards";
import { SearchSelect } from "~/components/ui/entity-picker";
import type { BookingDraft } from "./use-booking-draft";

/**
 * Who a scheduled session is for. Only shown to people who schedule for others
 * — a self-serve booking is implicitly for the person making it.
 */
export function AttendeeFields({
  draft,
  className = "grid grid-cols-2 gap-3",
}: {
  draft: BookingDraft;
  className?: string;
}) {
  const { group, groupsPage, groupFaculty, facultyPage, selectedFaculty } =
    draft;

  return (
    <div className={className}>
      <label className="flex flex-col gap-1.5">
        <span className="text-ink text-[13px] font-semibold">
          Class / group
        </span>
        <SearchSelect
          value={group ? groupCard(group) : null}
          onChange={draft.setGroupId}
          page={
            groupsPage.data && {
              ...groupsPage.data,
              rows: groupsPage.data.rows.map(groupCard),
            }
          }
          loading={groupsPage.isLoading}
          query={draft.groupQuery}
          onQueryChange={draft.setGroupQuery}
          onLoadMore={draft.loadMoreGroups}
          placeholder="Search groups…"
          listId="booking-group"
          emptyOption="No group"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-ink text-[13px] font-semibold">Faculty</span>
        <SearchSelect
          value={selectedFaculty ? facultyCard(selectedFaculty) : null}
          onChange={draft.setFacultyId}
          page={
            groupFaculty.length
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
              : facultyPage.data && {
                  ...facultyPage.data,
                  rows: facultyPage.data.rows.map(facultyCard),
                }
          }
          loading={facultyPage.isLoading}
          query={draft.facultyQuery}
          onQueryChange={draft.setFacultyQuery}
          onLoadMore={draft.loadMoreFaculty}
          placeholder="Search faculty…"
          listId="booking-faculty"
          emptyOption="No faculty"
        />
      </label>
    </div>
  );
}
