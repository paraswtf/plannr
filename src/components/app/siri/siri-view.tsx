"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
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

      <div className="flex max-w-[760px] flex-col gap-5 px-4 pt-2 pb-10 sm:px-6 lg:px-9">
        <Card pad={20}>
          <h2 className="font-display text-title m-0 text-[15px] font-bold">
            What this does
          </h2>
          <p className="text-muted mt-2 mb-0 text-[13.5px] leading-relaxed">
            You make a key, then build a shortcut on your phone that calls
            Plannr and reads the answer out. After that, saying{" "}
            <em>&ldquo;Hey Siri, next lecture&rdquo;</em> gets you something
            like:
          </p>
          <p
            className="text-title mt-3 mb-0 rounded-xl p-3.5 text-[13.5px] italic"
            style={{ background: "var(--card-soft)" }}
          >
            &ldquo;Your next class is tomorrow, Design Thinking at 9am, in room
            4&nbsp;0&nbsp;3.&rdquo;
          </p>
          <p className="text-faint mt-3 mb-0 text-[12.5px] leading-relaxed">
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

        <Card pad={20}>
          <h2 className="font-display text-title m-0 text-[15px] font-bold">
            The four you can build
          </h2>
          <p className="text-muted mt-2 mb-3 text-[13.5px]">
            Same steps each time — only the URL and the name change.
          </p>
          <div className="flex flex-col gap-3">
            {SIRI_ENDPOINTS.map((endpoint) => (
              <div
                key={endpoint.path}
                className="rounded-xl p-3.5"
                style={{ boxShadow: "var(--ring)" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-title text-[13.5px] font-bold">
                    &ldquo;Hey Siri, {endpoint.phrase.toLowerCase()}&rdquo;
                  </span>
                  {endpoint.day && <Badge tone="slate">{endpoint.day}</Badge>}
                </div>
                <p className="text-muted mt-1 mb-2.5 text-[12.5px]">
                  {endpoint.blurb}
                </p>
                <Copyable
                  label={`URL for ${endpoint.phrase}`}
                  value={siriUrl(origin, endpoint)}
                />
                <p className="text-faint mt-2 mb-0 text-[12px] italic">
                  {endpoint.specimen}
                </p>
              </div>
            ))}
          </div>
          <p className="text-faint mt-3.5 mb-0 text-[12.5px] leading-relaxed">
            Change <code className="font-mono">day=tomorrow</code> to{" "}
            <code className="font-mono">today</code>, a weekday like{" "}
            <code className="font-mono">monday</code>, or a date like{" "}
            <code className="font-mono">2026-09-15</code>. A weekday means the
            next one, today included; say{" "}
            <code className="font-mono">next monday</code> for the one after.
          </p>
        </Card>
      </div>
    </>
  );
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
  return (
    <Card pad={20}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-title m-0 text-[15px] font-bold">
          Step 1 — make a key
        </h2>
        <button
          type="button"
          disabled={creating}
          onClick={onCreate}
          className="inline-flex min-h-10 cursor-pointer items-center rounded-[var(--radius-btn)] px-3.5 text-[13px] font-semibold text-white lg:min-h-0 lg:py-2"
          style={{
            background: "var(--grad-brand)",
            opacity: creating ? 0.6 : 1,
          }}
        >
          {creating
            ? "Making…"
            : live.length > 0
              ? "Make another"
              : "Make a key"}
        </button>
      </div>

      {token ? (
        <div
          className="mt-3.5 rounded-xl p-3.5"
          style={{
            background: "rgba(246,167,59,0.10)",
            boxShadow: "inset 0 0 0 1px var(--mine-ring)",
          }}
        >
          <div className="flex items-center gap-2">
            <Icon name="alert" size={16} color="#a2660f" stroke={2} />
            <span className="text-[12.5px] font-semibold text-[#a2660f]">
              Copy this now. It is not shown again, and nobody can look it up.
            </span>
          </div>
          <div className="mt-2.5">
            <Copyable label="Your key" value={token} secret />
          </div>
          <p className="text-muted mt-2 mb-0 text-[12px]">
            If you lose it, switch this key off and make another — that is
            quicker than it sounds, and safer than writing it somewhere.
          </p>
        </div>
      ) : (
        <p className="text-muted mt-2 mb-0 text-[13.5px] leading-relaxed">
          {live.length > 0
            ? "You already have a key. Its secret was only shown when you made it — if you no longer have it, switch that one off and make a new one."
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
    <div className="mt-3.5 flex flex-col gap-2">
      {live.map((key) => (
        <div
          key={key.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3.5 py-2.5"
          style={{ boxShadow: "var(--ring)" }}
        >
          <span className="text-title text-[13px] font-semibold">
            {key.name}
          </span>
          <span className="text-faint font-mono text-[12px]">
            {tokenHandle(key.prefix, key.last4)}
          </span>
          <span className="text-faint text-[12px]">
            {key.lastUsedAt ? "in use" : "never used"}
          </span>
          <button
            type="button"
            disabled={revoking === key.id}
            onClick={() => onRevoke(key.id)}
            className="ml-auto inline-flex min-h-10 cursor-pointer items-center rounded-lg px-3 text-[12.5px] font-semibold text-[#b02636] lg:min-h-0 lg:py-1.5"
            style={{ boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)" }}
          >
            {revoking === key.id ? "Switching off…" : "Switch off"}
          </button>
        </div>
      ))}
    </div>
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
    <Card pad={20}>
      <h2 className="font-display text-title m-0 text-[15px] font-bold">
        Step 2 — build the shortcut
      </h2>
      <p className="text-muted mt-2 mb-3.5 text-[13.5px] leading-relaxed">
        On your iPhone, in the <strong>Shortcuts</strong> app. This builds
        &ldquo;next lecture&rdquo;; the other three are the same with a
        different URL.
      </p>

      {/*
       * Not a flex column, however tempting the gap utility is: `display: flex`
       * makes each `li` a flex item, and a flex item draws no list marker — so
       * a numbered walkthrough silently loses its numbers, which are the only
       * thing telling somebody on a phone where they had got to. Margins
       * instead, and the markers stay both drawn and announced.
       */}
      <ol className="text-ink m-0 flex-none space-y-3.5 pl-5 text-[13.5px] leading-relaxed [&>li]:pl-1">
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
            <Copyable
              label="Authorization header"
              value={header}
              secret={Boolean(token)}
            />
          </div>
          {!token && (
            <span className="text-faint mt-1.5 block text-[12px]">
              Replace <code className="font-mono">&lt;your key&gt;</code> with
              the key from step 1 — the word <strong>Bearer</strong>, a space,
              then the key.
            </span>
          )}
        </li>
        <li>
          Tap <strong>Add Action</strong> again, search for{" "}
          <strong>Get Dictionary Value</strong>, and tap it. Set{" "}
          <strong>Key</strong> to <code className="font-mono">speech</code>.
        </li>
        <li>
          Tap <strong>Add Action</strong> once more, search for{" "}
          <strong>Speak Text</strong>, and tap it. It will already be pointed at
          the value from the step before.
        </li>
        <li>
          Tap the shortcut&rsquo;s name at the top, choose{" "}
          <strong>Rename</strong>, and call it <strong>{first.phrase}</strong>.
          That name is what you say — so keep it short and say it out loud once
          to check it sounds like something you would actually ask.
        </li>
        <li>
          Tap <strong>Done</strong>, then run it once from the list to check it
          speaks. The first run asks permission to contact {hostOf(origin)} —
          allow it.
        </li>
        <li>
          Say <em>&ldquo;Hey Siri, {first.phrase.toLowerCase()}&rdquo;</em>.
        </li>
      </ol>

      <div
        className="mt-4 rounded-xl p-3.5"
        style={{ background: "var(--card-soft)" }}
      >
        <span className="text-title text-[13px] font-semibold">
          Worth doing while you are here
        </span>
        <p className="text-muted mt-1.5 mb-0 text-[12.5px] leading-relaxed">
          In the shortcut&rsquo;s settings (the <strong>i</strong> button), turn
          on <strong>Show on Lock Screen</strong>, or add it to{" "}
          <strong>Back Tap</strong> under Settings &rarr; Accessibility &rarr;
          Touch. Asking without speaking is the difference between using this
          and forgetting it exists.
        </p>
      </div>

      <p className="text-faint mt-3.5 mb-0 text-[12.5px] leading-relaxed">
        If Siri says nothing at all, the usual cause is the header: it must be
        the word <strong>Bearer</strong>, one space, then the key, with no
        quotes and no line break. Run the shortcut from the Shortcuts app rather
        than by voice to see the error.
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
function Copyable({
  label,
  value,
  secret = false,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
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
    <div
      className="bg-surface flex items-center gap-2 rounded-lg py-1.5 pr-1.5 pl-2.5"
      style={{ boxShadow: "var(--ring)" }}
    >
      {/*
       * `select-all` so a tap selects the whole value where the clipboard API
       * is unavailable — an insecure origin, or a browser that refuses it — and
       * `break-all` because a token has no spaces to wrap at and would
       * otherwise push the card off a phone.
       */}
      <code className="text-ink min-w-0 flex-1 font-mono text-[12px] break-all select-all">
        {value}
      </code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => void copy()}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg lg:h-8 lg:w-8"
        style={{ background: "rgba(68,88,121,0.07)" }}
      >
        <Icon
          name={copied ? "checkCircle" : secret ? "key" : "copy"}
          size={14}
          color={copied ? "#4e7d3a" : "var(--slate)"}
          stroke={2}
        />
      </button>
    </div>
  );
}
