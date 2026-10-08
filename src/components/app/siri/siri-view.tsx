"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { tokenHandle } from "~/components/app/api-keys/controls";
import { api, type RouterOutputs } from "~/trpc/react";
import { SIRI_ENDPOINTS, siriUrl } from "./endpoints";

type Key = RouterOutputs["apiKeys"]["mine"][number];

/**
 * Setting a phone up to answer questions about your own timetable.
 *
 * The screen has two halves and they are two different jobs. Minting the key is
 * one button, because a personal key holds nothing but what its owner already
 * holds and there is nothing to configure. Wiring it into Shortcuts is the
 * hard part — it is a dozen taps in an app most people have never opened — so
 * the instructions are the bulk of the page and are written to be followed on
 * the phone being set up, one numbered step at a time, with every value that
 * has to be typed offered as a copy button rather than as something to read
 * across from a laptop.
 *
 * The token is shown once, inline, and the instructions are deliberately still
 * useful after it is gone: everything except the Authorization value is a
 * fixed string, so somebody coming back to add a second shortcut has all four
 * URLs and needs only the key they already saved.
 */
export function SiriView({ keys, origin }: { keys: Key[]; origin: string }) {
  const router = useRouter();
  const utils = api.useUtils();

  /**
   * The freshly minted token, held here and nowhere else.
   *
   * Not in the URL, not in a query cache the devtools will print, and gone from
   * the page on the next navigation. It outlives the mint — unlike the API-key
   * console's modal, which drops it on close — because the whole point of this
   * screen is that you are typing it into another app on the same device while
   * looking at the steps beneath it, and a box you must dismiss to read the
   * instructions is a box you copy out of twice.
   */
  const [minted, setMinted] = useState<{ id: string; token: string } | null>(
    null,
  );
  const token = minted?.token ?? null;

  const create = api.apiKeys.createMine.useMutation({
    onSuccess: async (key) => {
      setMinted({ id: key.id, token: key.token });
      await utils.apiKeys.mine.invalidate();
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const revoke = api.apiKeys.revokeMine.useMutation({
    onSuccess: async (_result, variables) => {
      // Only when it was *this* key. Somebody who has just minted a second key
      // for an iPad and then switches off the old one from the same screen must
      // not have the new token taken off the page: it is not recoverable, and
      // they were in the middle of copying it.
      setMinted((current) => (current?.id === variables.id ? null : current));
      toast.success(
        "Key switched off. Any shortcut using it will stop working.",
      );
      await utils.apiKeys.mine.invalidate();
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const live = keys.filter((key) => key.status === "active");

  return (
    <>
      <PageHeader
        title="Siri"
        subtitle="Ask your phone when your next lecture is"
      />

      {/* The same narrow column as the other settings screens: a walkthrough
          is read top to bottom, and a line of it longer than this is harder to
          keep your place in. */}
      <PageBody width="narrow" className="flex flex-col gap-5">
        <Card title="What this does">
          <p className="text-ink text-base leading-relaxed">
            You make a key, then build a shortcut on your phone that calls
            Plannr and reads the answer out. After that, saying{" "}
            <em>&ldquo;Hey Siri, next lecture&rdquo;</em> gets you something
            like:
          </p>
          <p className="bg-tint text-title mt-3 rounded-[12px] px-4 py-3.5 text-base italic">
            &ldquo;Your next class is tomorrow, Design Thinking at 9am, in room
            4&nbsp;0&nbsp;3.&rdquo;
          </p>
          <p className="text-muted mt-3 text-sm leading-relaxed">
            The key only ever answers questions about your own timetable. It
            cannot book a room, change a class or read anybody else&rsquo;s day,
            and it stops working the moment your account does.
          </p>
        </Card>

        <StepOne
          live={live}
          token={token}
          creating={create.isPending}
          revoking={revoke.isPending ? revoke.variables?.id : undefined}
          onCreate={() => create.mutate({ name: "Siri" })}
          onRevoke={(id) => revoke.mutate({ id })}
        />

        <StepTwo origin={origin} token={token} />

        <Card title="The four you can build">
          <p className="text-muted -mt-2 text-sm">
            Same steps each time. Only the URL and the name change.
          </p>
          {/*
           * One list divided by hairlines rather than four ringed boxes in a
           * card. No day chip either: the day is already in the phrase beside
           * it and spelled into the URL under it.
           */}
          <ul className="mt-2">
            {SIRI_ENDPOINTS.map((endpoint) => (
              <li
                key={endpoint.path}
                className="py-4 shadow-[inset_0_1px_0_var(--hair-soft)] first:shadow-none"
              >
                <p className="font-display text-title text-base font-semibold">
                  &ldquo;Hey Siri, {spoken(endpoint.phrase)}&rdquo;
                </p>
                <p className="text-muted mt-0.5 mb-2.5 text-sm">
                  {endpoint.blurb}
                </p>
                <Copyable
                  label={`URL for ${endpoint.phrase}`}
                  value={siriUrl(origin, endpoint)}
                />
                <p className="text-muted mt-2 text-sm italic">
                  {endpoint.specimen}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-1 pt-4 text-sm leading-relaxed shadow-[inset_0_1px_0_var(--hair-soft)]">
            Change{" "}
            <code className="text-ink font-mono text-xs">day=tomorrow</code> to{" "}
            <code className="text-ink font-mono text-xs">today</code>, a weekday
            like <code className="text-ink font-mono text-xs">monday</code>, or
            a date like{" "}
            <code className="text-ink font-mono text-xs">2026-09-15</code>. A
            weekday means the next one, today included; say{" "}
            <code className="text-ink font-mono text-xs">next monday</code> for
            the one after.
          </p>
        </Card>
      </PageBody>
    </>
  );
}

/**
 * A shortcut's name as you would say it after "Hey Siri,": only the first
 * letter dropped to lower case. Lowering the whole phrase turned "Do I have
 * class tomorrow" into "do i have class tomorrow".
 */
function spoken(phrase: string): string {
  return phrase.charAt(0).toLowerCase() + phrase.slice(1);
}

/** The key: making one, seeing it once, and switching it off. */
function StepOne({
  live,
  token,
  creating,
  revoking,
  onCreate,
  onRevoke,
}: {
  live: Key[];
  token: string | null;
  creating: boolean;
  revoking: string | undefined;
  onCreate: () => void;
  onRevoke: (id: string) => void;
}) {
  /*
   * Primary only while there is no key: making one is then the whole of this
   * step and the next thing to do on the page. Once a key exists the next job
   * is Step 2, so "Make another" steps down to secondary rather than being the
   * loudest thing on the screen.
   */
  const first = live.length === 0;

  return (
    <Card
      title="Step 1: make a key"
      action={
        <Button
          variant={first ? "primary" : "secondary"}
          icon={first ? "key" : "plus"}
          disabled={creating}
          onClick={onCreate}
        >
          {creating ? "Making…" : first ? "Make a key" : "Make another"}
        </Button>
      }
    >
      {token ? (
        /*
         * Amber, the app's "read this before you go on", rather than the gold
         * it used to be: gold means "yours" on the timetable and nothing else.
         * And the same tone for the same warning wherever a key is shown once.
         */
        <Callout
          tone="warn"
          title="Copy this now. It is not shown again, and nobody can look it up."
        >
          <div className="mt-2.5">
            <Copyable label="Your key" value={token} />
          </div>
          <p className="text-muted mt-2 text-xs">
            If you lose it, switch this key off and make another. That is
            quicker than it sounds, and safer than writing it somewhere.
          </p>
        </Callout>
      ) : (
        <p className="text-muted text-base leading-relaxed">
          {live.length > 0
            ? "You already have a key. Its secret was only shown when you made it. If you no longer have it, switch that one off and make a new one."
            : "One tap. You will see the key once, so have the Shortcuts app ready, or paste it somewhere safe first."}
        </p>
      )}

      {keysList(live, revoking, onRevoke)}
    </Card>
  );
}

function keysList(
  live: Key[],
  revoking: string | undefined,
  onRevoke: (id: string) => void,
) {
  if (live.length === 0) return null;
  return (
    // Plain rows under a hairline rather than ringed boxes inside the card.
    <ul className="mt-4">
      {live.map((key) => (
        <li
          key={key.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 shadow-[inset_0_1px_0_var(--hair-soft)]"
        >
          <span className="text-title text-sm font-semibold">{key.name}</span>
          <span className="text-muted font-mono text-xs break-all">
            {tokenHandle(key.prefix, key.last4)}
          </span>
          <span className="text-muted text-xs">
            {key.lastUsedAt ? "in use" : "never used"}
          </span>
          {/* The quiet red: switching a key off is final for that key, but it
              is one tap with no confirmation, and the way back is another key. */}
          <Button
            variant="danger-quiet"
            size="sm"
            disabled={revoking === key.id}
            onClick={() => onRevoke(key.id)}
            className="ml-auto"
          >
            {revoking === key.id ? "Switching off…" : "Switch off"}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Shortcuts walkthrough.
 *
 * An ordered list with its own numerals drawn, and `list-none` deliberately
 * *not* used: Safari — which is the only browser the person following this is
 * holding — drops list semantics from a list styled with no marker, and
 * VoiceOver would then announce twelve unrelated paragraphs instead of "step 3
 * of 12". The markers are kept and merely restyled.
 */
function StepTwo({ origin, token }: { origin: string; token: string | null }) {
  const first = SIRI_ENDPOINTS[0]!;
  const header = token ? `Bearer ${token}` : "Bearer <your key>";

  return (
    <Card title="Step 2: build the shortcut">
      <p className="text-muted -mt-2 mb-4 text-base leading-relaxed">
        On your iPhone, in the <strong className="text-ink">Shortcuts</strong>{" "}
        app. This builds &ldquo;next lecture&rdquo;; the other three are the
        same with a different URL.
      </p>

      {/*
       * Not a flex column, however tempting the gap utility is: `display: flex`
       * makes each `li` a flex item, and a flex item draws no list marker — so
       * a numbered walkthrough silently loses its numbers, which are the only
       * thing telling somebody on a phone where they had got to. Margins
       * instead, and the markers stay both drawn and announced.
       *
       * `list-decimal` is spelled out because Tailwind's preflight sets every
       * `ol` to `list-style: none`, which had been hiding the numbers all
       * along. The markers are set in the mono face, which is for counts, in
       * the muted ink so they guide rather than shout.
       */}
      <ol className="text-ink marker:text-muted list-decimal space-y-3.5 pl-6 text-base leading-relaxed marker:font-mono marker:text-sm [&>li]:pl-1.5">
        <li>
          Open <strong>Shortcuts</strong> and tap <strong>+</strong> at the top
          right.
        </li>
        <li>
          Tap <strong>Add Action</strong>, search for{" "}
          <strong>Get Contents of URL</strong>, and tap it.
        </li>
        <li>
          Tap the <strong>URL</strong> field and paste this:
          <div className="mt-2">
            <Copyable label="Shortcut URL" value={siriUrl(origin, first)} />
          </div>
        </li>
        <li>
          Tap <strong>Show More</strong> underneath it. Leave{" "}
          <strong>Method</strong> as <strong>GET</strong>.
        </li>
        <li>
          Under <strong>Headers</strong>, tap <strong>Add new header</strong>.
          Type <strong>Authorization</strong> as the key, and paste this as the
          value:
          <div className="mt-2">
            <Copyable label="Authorization header" value={header} />
          </div>
          {!token && (
            <span className="text-muted mt-1.5 block text-sm">
              Replace{" "}
              <code className="font-mono text-xs">&lt;your key&gt;</code> with
              the key from step 1: the word <strong>Bearer</strong>, a space,
              then the key.
            </span>
          )}
        </li>
        <li>
          Tap <strong>Add Action</strong> again, search for{" "}
          <strong>Get Dictionary Value</strong>, and tap it. Set{" "}
          <strong>Key</strong> to{" "}
          <code className="font-mono text-sm">speech</code>.
        </li>
        <li>
          Tap <strong>Add Action</strong> once more, search for{" "}
          <strong>Speak Text</strong>, and tap it. It will already be pointed at
          the value from the step before.
        </li>
        <li>
          Tap the shortcut&rsquo;s name at the top, choose{" "}
          <strong>Rename</strong>, and call it <strong>{first.phrase}</strong>.
          That name is what you say, so keep it short and say it out loud once
          to check it sounds like something you would actually ask.
        </li>
        <li>
          Tap <strong>Done</strong>, then run it once from the list to check it
          speaks. The first run asks permission to contact {hostOf(origin)}.
          Allow it.
        </li>
        <li>
          Say <em>&ldquo;Hey Siri, {spoken(first.phrase)}&rdquo;</em>.
        </li>
      </ol>

      <Callout
        tone="neutral"
        icon="star"
        title="Worth doing while you are here"
        className="mt-5"
      >
        In the shortcut&rsquo;s settings (the <strong>i</strong> button), turn
        on <strong>Show on Lock Screen</strong>, or add it to{" "}
        <strong>Back Tap</strong> under Settings &rarr; Accessibility &rarr;
        Touch. Asking without speaking is the difference between using this and
        forgetting it exists.
      </Callout>

      <p className="text-muted mt-4 text-sm leading-relaxed">
        If Siri says nothing at all, the usual cause is the header: it must be
        the word <strong className="text-ink">Bearer</strong>, one space, then
        the key, with no quotes and no line break. Run the shortcut from the
        Shortcuts app rather than by voice to see the error.
      </p>
    </Card>
  );
}

/** Just the host, for a sentence about the permission prompt iOS shows. */
function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return "Plannr";
  }
}

/**
 * A value with a copy button.
 *
 * Copying rather than reading across matters more here than usual: the strings
 * are a 60-character token and a URL with a query on the end, being typed into
 * a different app on the same small screen, and one wrong character produces
 * silence rather than an error.
 */
function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied.");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error(
        "Could not reach the clipboard. Select the text and copy it by hand.",
      );
    }
  };

  return (
    // 14px outside, 4px of padding, the button's own 10px inside it:
    // concentric, so the button reads as seated in the well rather than
    // dropped on it.
    <div className="bg-surface flex items-center gap-2 rounded-[14px] p-1 pl-3 shadow-[inset_0_0_0_1px_var(--hair)]">
      {/*
       * `select-all` so a tap selects the whole value where the clipboard API
       * is unavailable — an insecure origin, or a browser that refuses it — and
       * `break-all` because a token has no spaces to wrap at and would
       * otherwise push the card off a phone.
       */}
      <code className="text-ink min-w-0 flex-1 py-1.5 font-mono text-xs break-all select-all">
        {value}
      </code>
      {/* The copy glyph for every value, the key among them — a key glyph on a
          copy button said "key", not "copy" — and a tick once it is done. */}
      <IconButton
        icon={copied ? "check" : "copy"}
        label={`Copy ${label}`}
        variant="quiet"
        size="sm"
        onClick={() => void copy()}
      />
    </div>
  );
}
