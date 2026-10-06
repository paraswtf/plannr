"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import { PlannrMark } from "~/ui/brand";

import {
  base32ToBytes,
  codeMatches,
  DECK_SECRET,
  UNLOCK_KEY,
  unlockToken,
} from "./totp";

type State = "checking" | "locked" | "open" | "unsupported";

const readToken = () => {
  try {
    return window.localStorage.getItem(UNLOCK_KEY);
  } catch {
    return null;
  }
};
const keepToken = (token: string) => {
  try {
    window.localStorage.setItem(UNLOCK_KEY, token);
  } catch {
    // Private windows can refuse storage; then it unlocks for this visit only.
  }
};

/**
 * The deck behind a six-digit code from an authenticator app. A browser that
 * has matched a code once keeps a token and opens straight away from then on;
 * every other browser sees the lock first. Nothing of the deck is rendered,
 * on the server or the client, until it opens, so the exported pages hold only
 * this screen. Without a secret configured the deck is simply open.
 */
export function DeckLock({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(DECK_SECRET ? "checking" : "open");

  useEffect(() => {
    if (!DECK_SECRET) return;
    if (!globalThis.crypto?.subtle) {
      setState("unsupported");
      return;
    }
    let live = true;
    void unlockToken(base32ToBytes(DECK_SECRET)).then((token) => {
      if (live) setState(readToken() === token ? "open" : "locked");
    });
    return () => {
      live = false;
    };
  }, []);

  if (state === "open") return children;
  return (
    <main
      className="font-body text-fg fixed inset-0 flex items-center justify-center px-6"
      style={{ background: "var(--bg)" }}
    >
      {state === "locked" && <CodeForm onOpen={() => setState("open")} />}
      {state === "unsupported" && (
        <p className="text-muted max-w-[420px] text-center text-[17px] leading-relaxed">
          This browser can&apos;t check the code here. Open the deck over https
          or on localhost.
        </p>
      )}
    </main>
  );
}

function CodeForm({ onOpen }: { onOpen: () => void }) {
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [checking, setChecking] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => field.current?.focus(), []);

  const check = async (attempt: string) => {
    setChecking(true);
    const secret = base32ToBytes(DECK_SECRET);
    if (await codeMatches(secret, attempt)) {
      keepToken(await unlockToken(secret));
      onOpen();
      return;
    }
    setChecking(false);
    setWrong(true);
    gsap.fromTo(
      field.current,
      { x: -10 },
      { x: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" },
    );
    window.setTimeout(() => setCode(""), 450);
  };

  return (
    <form
      className="flex w-full max-w-[420px] flex-col items-center text-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6 && !checking) void check(code);
      }}
    >
      <PlannrMark height={44} />
      <h1 className="font-display mt-7 text-[34px] leading-tight font-semibold tracking-[-0.02em]">
        Presenting Plannr
      </h1>
      <p className="text-muted mt-2 text-[17px] leading-relaxed">
        Enter the code from your authenticator app. This browser stays unlocked
        after.
      </p>
      <input
        ref={field}
        value={code}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
          setCode(digits);
          setWrong(false);
          if (digits.length === 6 && !checking) void check(digits);
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        aria-label="Six-digit code"
        aria-invalid={wrong}
        disabled={checking}
        placeholder="000000"
        className="bg-raised text-fg placeholder:text-faint mt-8 w-full rounded-[22px] px-6 py-5 text-center font-mono text-[40px] font-semibold tracking-[0.35em] tabular-nums outline-none"
        style={{
          boxShadow: wrong
            ? "inset 0 0 0 1.5px var(--accent), var(--shadow-2)"
            : "inset 0 0 0 1px var(--line), var(--shadow-2)",
        }}
      />
      <p
        role="status"
        className="mt-4 min-h-[24px] text-[16px]"
        style={{ color: wrong ? "var(--accent)" : "transparent" }}
      >
        That code didn&apos;t match. Try the one showing now.
      </p>
    </form>
  );
}
