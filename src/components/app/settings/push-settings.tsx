"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon } from "~/components/ui/icon";
import { Skeleton } from "~/components/ui/skeleton";
import {
  currentSubscription,
  describe,
  pushSupport,
  subscribeThisBrowser,
  type PushSupport,
} from "~/lib/push/browser";
import { api } from "~/trpc/react";

/**
 * Turning notifications on for this phone or laptop.
 *
 * Per browser rather than per person: the question is whether *this* device
 * should buzz, and someone with a phone and a lab PC wants a different answer
 * for each. The server keeps one row per browser; the browser itself is the
 * source of truth for whether it is subscribed, so this panel asks it rather
 * than trusting a count.
 */
export function PushSettings() {
  const utils = api.useUtils();
  const { data } = api.push.config.useQuery();

  const [support, setSupport] = useState<PushSupport | null>(null);
  const [listening, setListening] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const subscribe = api.push.subscribe.useMutation();
  const unsubscribe = api.push.unsubscribe.useMutation();
  const test = api.push.sendTest.useMutation();

  const refresh = useCallback(async () => {
    const level = pushSupport();
    setSupport(level);
    if (level === "ready" || level === "blocked") {
      setListening(Boolean(await currentSubscription().catch(() => null)));
    } else {
      setListening(false);
    }
  }, []);

  // Browser capabilities are only knowable in the browser, after mount.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const turnOn = async () => {
    if (!data?.available) return;
    setBusy(true);
    try {
      const result = await subscribeThisBrowser(data.publicKey);
      if (result === "denied") {
        toast.error("Notifications were not allowed on this device.");
        return;
      }
      await subscribe.mutateAsync(describe(result));
      toast.success("Notifications are on for this device.");
      await utils.push.config.invalidate();
    } catch {
      toast.error("Could not turn notifications on. Try again in a moment.");
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await unsubscribe.mutateAsync({ endpoint });
      }
      toast.success("Notifications are off for this device.");
      await utils.push.config.invalidate();
    } catch {
      toast.error("Could not turn notifications off. Try again.");
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const sendTest = async () => {
    const result = await test.mutateAsync().catch(() => null);
    if (!result) toast.error("Could not send the test.");
    else if (result.sent === 0) toast.error("No device accepted the test.");
    else toast.success("Sent. It should arrive in a few seconds.");
  };

  if (!data || support === null || listening === null) {
    return (
      <Card>
        <div role="status" aria-label="Checking notifications…">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-[12px]" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Skeleton className="mt-5 h-10 w-36 rounded-[var(--radius-btn)] lg:h-9" />
        </div>
      </Card>
    );
  }

  if (!data.available) {
    return (
      <Card>
        <EmptyState
          compact
          icon="alert"
          title="Push notifications are not set up on this server."
        >
          Your inbox in Plannr still gets everything you choose below.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${
            listening ? "bg-tint text-good" : "bg-tint text-slate"
          }`}
        >
          <Icon
            name={listening ? "checkCircle" : "alert"}
            size={20}
            stroke={1.9}
          />
        </span>
        <div className="min-w-0">
          <div className="text-title text-base font-semibold">
            {listening ? "On for this device" : "Off for this device"}
          </div>
          <div className="text-muted text-sm">
            {data.devices === 0
              ? "No devices yet"
              : data.devices === 1
                ? "1 device listening"
                : `${data.devices} devices listening`}
          </div>
        </div>
      </div>

      <p className="text-ink mt-4 max-w-[62ch] text-sm leading-relaxed">
        With this on, this device tells you straight away when there is news for
        you, even with Plannr closed: a class of yours that moves, is cancelled,
        comes back or is added, and whatever else you choose below.
      </p>

      {support === "install-first" && (
        <div className="mt-4">
          <Callout tone="info" title="Add Plannr to your Home Screen first">
            On iPhone and iPad, notifications work for apps added to the Home
            Screen. Tap Share, then Add to Home Screen, and open Plannr from
            there.
          </Callout>
        </div>
      )}
      {support === "unsupported" && (
        <div className="mt-4">
          <Callout
            tone="warn"
            title="This browser cannot receive notifications"
          >
            Try Chrome, Edge, Firefox or Safari 16.4 or later.
          </Callout>
        </div>
      )}
      {support === "blocked" && !listening && (
        <div className="mt-4">
          <Callout tone="warn" title="Notifications are blocked for this site">
            Allow them in your browser&rsquo;s site settings, then come back and
            turn them on.
          </Callout>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {listening ? (
          <>
            <Button
              onClick={() => void sendTest()}
              disabled={test.isPending}
              icon="check"
            >
              {test.isPending ? "Sending…" : "Send a test"}
            </Button>
            <Button
              variant="danger-quiet"
              onClick={() => void turnOff()}
              disabled={busy}
              className="ml-auto"
            >
              {busy ? "Turning off…" : "Turn off"}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            onClick={() => void turnOn()}
            disabled={busy || support !== "ready"}
          >
            {busy ? "Turning on…" : "Turn on notifications"}
          </Button>
        )}
      </div>
    </Card>
  );
}
