"use client";

import { facultyCard, groupCard } from "~/components/app/people/entity-cards";
import { Icon } from "~/components/ui/icon";
import {
  EntityPicker,
  pickerPage,
  SearchSelect,
} from "~/components/ui/entity-picker";
import { Field } from "~/components/ui/field";
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
      <Field label="Class / group">
        {(id) => (
          <>
            <SearchSelect
              id={id}
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
            {/*
             * The field's own error line, in the type `Field` gives one, and
             * announced: it appears in answer to choosing "Class".
             */}
            {draft.needsGroup && (
              <p
                role="alert"
                className="text-bad inline-flex items-center gap-1.5 text-xs font-medium"
              >
                <Icon name="alert" size={13} stroke={2} />A class needs a group
                attending it.
              </p>
            )}
          </>
        )}
      </Field>

      <Field label="Faculty">
        {(id) => (
          <SearchSelect
            id={id}
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
        )}
      </Field>

      {/*
       * A lecture given to two sections at once is one event with both groups
       * on it, not two bookings of the same room — the room only has to fit
       * once, and the register is taken per group.
       */}
      {draft.groupId && (
        <Field label="Also attending">
          {(id) => (
            <EntityPicker
              id={id}
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
          )}
        </Field>
      )}
    </div>
  );
}
