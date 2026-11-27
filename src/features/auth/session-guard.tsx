"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BACKGROUND_HEADER, policyForRole } from "@/lib/auth/session-policy";
import { createClient } from "@/lib/supabase/client";

const LAST_ACTIVE_KEY = "farmess.lastActive";
const TICK_MS = 5_000;
/** Warn this long before an idle sign-out. */
const WARNING_SECONDS = 60;
/** While the person is working, tell the server at most this often. */
const KEEPALIVE_MS = 4 * 60_000;
/** Quiet check that the session still exists (signed out elsewhere, revoked). */
const STATUS_CHECK_MS = 2 * 60_000;

type SessionState = {
  signedIn?: boolean;
  signedInAt?: number | null;
  absoluteSeconds?: number;
  reason?: string;
};

function readSharedActivity(): number {
  try {
    const value = Number(window.localStorage.getItem(LAST_ACTIVE_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * Watches for inactivity while a workspace is open: warns a minute before the
 * idle limit, then signs out. Activity in any open Farmess tab counts. The
 * server enforces the same limits by itself (src/proxy.ts), so this is about
 * telling the person what is happening, not about trusting the browser.
 */
export function SessionGuard({ role }: { role: string }) {
  const policy = policyForRole(role);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActive = useRef(0);
  const lastShared = useRef(0);
  const lastPing = useRef(0);
  const lastStatus = useRef(0);
  const signedInAt = useRef<number | null>(null);
  const ending = useRef(false);

  const end = useCallback(
    async (reason: "idle" | "expired") => {
      if (ending.current) return;
      ending.current = true;
      try {
        await createClient().auth.signOut({ scope: "local" });
      } catch {
        // The server has already ended, or will end, the session; just leave.
      }
      window.location.assign(role === "admin" ? "/" : `/login?reason=${reason}`);
    },
    [role],
  );

  const ping = useCallback(
    async (background: boolean) => {
      const now = Date.now();
      if (background) lastStatus.current = now;
      else lastPing.current = now;
      try {
        const response = await fetch("/api/session", {
          cache: "no-store",
          headers: background ? { [BACKGROUND_HEADER]: "1" } : undefined,
        });
        const state = (await response.json().catch(() => ({}))) as SessionState;
        if (response.status === 401) {
          void end(state.reason === "idle" ? "idle" : "expired");
        } else if (response.ok && typeof state.signedInAt === "number") {
          signedInAt.current = state.signedInAt;
        }
      } catch {
        // Offline for a moment: the next tick tries again.
      }
    },
    [end],
  );

  useEffect(() => {
    // Loading the page was itself activity the server has just seen.
    lastActive.current = Date.now();
    lastPing.current = lastActive.current;
    void ping(true);

    const noteActivity = () => {
      const now = Date.now();
      lastActive.current = now;
      // Share with other tabs, at most every few seconds.
      if (now - lastShared.current > 5_000) {
        lastShared.current = now;
        try {
          window.localStorage.setItem(LAST_ACTIVE_KEY, String(now));
        } catch {
          // Storage unavailable: this tab still tracks its own activity.
        }
      }
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    for (const name of events) window.addEventListener(name, noteActivity, { passive: true });

    const timer = window.setInterval(() => {
      if (ending.current) return;
      const now = Date.now();
      const active = Math.max(lastActive.current, readSharedActivity());
      const idleSeconds = (now - active) / 1000;

      if (
        signedInAt.current !== null &&
        now / 1000 - signedInAt.current >= policy.absoluteSeconds
      ) {
        void end("expired");
        return;
      }
      if (idleSeconds >= policy.idleSeconds) {
        void end("idle");
        return;
      }
      const left = Math.ceil(policy.idleSeconds - idleSeconds);
      setSecondsLeft(left <= WARNING_SECONDS ? left : null);

      // Someone working in one long form makes no page requests: keep the
      // server's view of the session current while they are active.
      if (now - active < 60_000 && now - lastPing.current > KEEPALIVE_MS) void ping(false);
      else if (now - lastStatus.current > STATUS_CHECK_MS) void ping(true);
    }, TICK_MS);

    return () => {
      for (const name of events) window.removeEventListener(name, noteActivity);
      window.clearInterval(timer);
    };
  }, [end, ping, policy.absoluteSeconds, policy.idleSeconds]);

  if (secondsLeft === null) return null;
  return (
    <div className="session-warning" role="alertdialog" aria-labelledby="session-warning-title">
      <div className="session-warning-card">
        <h2 id="session-warning-title">Still there?</h2>
        <p>
          For your security you will be signed out in {Math.max(0, secondsLeft)} seconds because
          there has been no activity.
        </p>
        <button
          type="button"
          className="button button-primary"
          autoFocus
          onClick={() => {
            lastActive.current = Date.now();
            try {
              window.localStorage.setItem(LAST_ACTIVE_KEY, String(lastActive.current));
            } catch {
              // Ignored: see above.
            }
            setSecondsLeft(null);
            void ping(false);
          }}
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
