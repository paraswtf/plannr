"use client";

import { toast } from "sonner";

import { PushSettings } from "~/components/app/settings/push-settings";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Skeleton } from "~/components/ui/skeleton";
import { type NotificationCategory } from "~/lib/notifications";
import { api } from "~/trpc/react";

type Change = { category: NotificationCategory } & Partial<
  Record<"inApp" | "push", boolean>
>;

/**
 * What somebody hears about, and where.
 *
 * Two things that look alike and are not: the device switch at the top is
 * whether *this* phone or laptop may buzz at all, and the boxes below are what
 * the person wants to hear about, on every device they have. Each box saves
 * the moment it changes, drawn as changed before the server answers and put
 * back if it refuses, because a settings list with a Save button at the foot
 * is one where the last change is the one people forget to keep.
 */
export function NotificationPreferences() {
  const utils = api.useUtils();
  const prefs = api.notifications.preferences.useQuery();

  const save = api.notifications.setPreference.useMutation({
    onMutate: async (change: Change) => {
      await utils.notifications.preferences.cancel();
      const before = utils.notifications.preferences.getData();
      utils.notifications.preferences.setData(undefined, (current) =>
        current
          ? {
              ...current,
              categories: current.categories.map((row) =>
                row.category === change.category
                  ? {
                      ...row,
                      ...(change.inApp === undefined
                        ? {}
                        : { inApp: change.inApp }),
                      ...(change.push === undefined
                        ? {}
                        : { push: change.push }),
                    }
                  : row,
              ),
            }
          : current,
      );
      return { before };
    },
    onError: (_error, _change, context) => {
      if (context?.before) {
        utils.notifications.preferences.setData(undefined, context.before);
      }
      toast.error("Could not save that change. Try again.");
    },
    onSettled: () => utils.notifications.preferences.invalidate(),
  });

  return (
    <div className="flex flex-col gap-6">
      <PushSettings />

      {prefs.isError && !prefs.data ? (
        <Callout tone="bad" title="Could not load your notification settings">
          Check your connection, then reload the page.
        </Callout>
      ) : !prefs.data ? (
        <Card>
          <div role="status" aria-label="Loading notification settings…">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div>
          <Card title="What you hear about">
            {!prefs.data.pushAvailable && (
              <p className="text-muted mb-2 text-sm">
                Push is not set up on this server.
              </p>
            )}
            <ul>
              {prefs.data.categories.map((row, index) => (
                <li
                  key={row.category}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-6"
                  style={
                    index > 0
                      ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" }
                      : undefined
                  }
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-title text-sm font-semibold">
                      {row.label}
                    </p>
                    <p className="text-muted mt-0.5 text-sm">
                      {row.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-6">
                    <Checkbox
                      label="In Plannr"
                      checked={row.inApp}
                      onChange={(inApp) =>
                        save.mutate({ category: row.category, inApp })
                      }
                      ariaLabel={`${row.label}: in Plannr`}
                    />
                    <Checkbox
                      label="Push"
                      checked={row.push}
                      disabled={!prefs.data.pushAvailable}
                      onChange={(push) =>
                        save.mutate({ category: row.category, push })
                      }
                      ariaLabel={`${row.label}: push`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-faint mt-2 px-1 text-xs">
            With both boxes off for a kind of news, Plannr does not keep it at
            all: it will not be in your inbox later either.
          </p>
        </div>
      )}
    </div>
  );
}
