"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Callout } from "~/components/ui/callout";
import { Dialog } from "~/components/ui/dialog";
import { scopeDenialMessage } from "~/lib/api-scopes";
import { api } from "~/trpc/react";
import { Button } from "./controls";
import {
  draftIsValid,
  emptyDraft,
  expiryDays,
  KeyFields,
  type KeyDraft,
} from "./key-form";
import type { ScopeCatalog } from "./scope-picker";

/**
 * Minting a key.
 *
 * The mutation's result is handed straight to the caller and then wiped with
 * `reset()`. That second step is the point: React Query keeps a mutation's last
 * result until the component unmounts, so without it the plaintext token would
 * sit in the query cache — visible in the devtools, serialised into any state
 * dump — long after the dialog that was allowed to show it had gone.
 */
export function CreateKeyDialog({
  catalog,
  granterPermissions,
  onClose,
  onMinted,
}: {
  catalog: ScopeCatalog;
  granterPermissions: string;
  onClose: () => void;
  onMinted: (minted: { name: string; token: string }) => void;
}) {
  const [draft, setDraft] = useState<KeyDraft>(emptyDraft);
  const utils = api.useUtils();

  const create = api.apiKeys.create.useMutation({
    onSuccess: (key) => {
      const minted = { name: key.name, token: key.token };
      create.reset();
      void utils.apiKeys.list.invalidate();
      // Last, because it is what takes this dialog off the screen.
      onMinted(minted);
    },
    onError: (error) => toast.error(error.message),
  });

  const valid = draftIsValid(draft);
  const days = expiryDays(draft.expiry);

  return (
    <Dialog
      open
      title="Create an API key"
      icon="key"
      width={620}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid || create.isPending}
            onClick={() =>
              create.mutate({
                name: draft.name.trim(),
                description: draft.description.trim() || undefined,
                scopes: draft.scopes,
                // Null means "never", which the mint takes as the field simply
                // not being sent.
                expiresInDays: days ?? undefined,
                rateLimitPerMinute: Number(draft.rateLimit),
              })
            }
          >
            {create.isPending ? "Creating…" : "Create key"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-muted text-sm">
          The key is shown once, on the next screen, and never again. Have
          somewhere to put it before you press create.
        </p>

        <KeyFields
          draft={draft}
          onChange={setDraft}
          catalog={catalog}
          granterPermissions={granterPermissions}
          disabled={create.isPending}
        />

        {/*
         * Why "Create key" is still greyed out, said where the eye ends up
         * after the last box. The words are the server's own refusal, read
         * from the function that writes it, so the warning before the round
         * trip and the error after it can never drift apart.
         */}
        {draft.scopes.length === 0 && (
          <Callout tone="info">
            {scopeDenialMessage({ reason: "EMPTY" })}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
