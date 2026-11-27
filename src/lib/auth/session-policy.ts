/**
 * Session rules for Farmess, in one place.
 *
 *  - Idle limit: a session ends after this long without activity.
 *  - Absolute limit: a session ends this long after sign-in, however active.
 *
 * Both are judged on the server from the verified claims of the sign-in token
 * (its issue time and the original sign-in time), so they cannot be extended
 * by changing anything in the browser. While someone is active their token is
 * renewed every few minutes; a request that arrives with an old token therefore
 * proves nothing happened in between.
 */

export type SessionPolicy = {
  idleSeconds: number;
  absoluteSeconds: number;
};

/** Tokens older than this are renewed when the person does something. */
export const REFRESH_AFTER_SECONDS = 5 * 60;

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  idleSeconds: 30 * 60,
  absoluteSeconds: 12 * 60 * 60,
};

/** Admin accounts can change data for everyone, so their sessions are shorter. */
export const ADMIN_SESSION_POLICY: SessionPolicy = {
  idleSeconds: 15 * 60,
  absoluteSeconds: 8 * 60 * 60,
};

/** Longest any sign-in cookie needs to live in the browser. */
export const MAX_SESSION_SECONDS = Math.max(
  DEFAULT_SESSION_POLICY.absoluteSeconds,
  ADMIN_SESSION_POLICY.absoluteSeconds,
);

export function policyForRole(role: unknown): SessionPolicy {
  return role === "admin" ? ADMIN_SESSION_POLICY : DEFAULT_SESSION_POLICY;
}

export type SessionEndReason = "idle" | "expired";

export type SessionVerdict =
  { action: "continue" } | { action: "refresh" } | { action: "sign_out"; reason: SessionEndReason };

/** The verified token claims this file reads. */
export type SessionClaims = {
  iat?: unknown;
  amr?: unknown;
  app_metadata?: unknown;
};

export function roleFromClaims(claims: SessionClaims): string | null {
  const metadata = claims.app_metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const role = (metadata as { farmess_role?: unknown }).farmess_role;
  return typeof role === "string" ? role : null;
}

/**
 * When the person actually signed in (seconds since 1970). Renewing a token
 * keeps the original sign-in entries, so the earliest one is the sign-in time.
 */
export function signedInAtSeconds(claims: SessionClaims): number | null {
  const times: number[] = [];
  if (Array.isArray(claims.amr)) {
    for (const entry of claims.amr) {
      const timestamp =
        entry && typeof entry === "object" ? (entry as { timestamp?: unknown }).timestamp : null;
      if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0) {
        times.push(timestamp);
      }
    }
  }
  if (times.length > 0) return Math.min(...times);
  return typeof claims.iat === "number" && Number.isFinite(claims.iat) ? claims.iat : null;
}

/**
 * Decide what to do with a signed-in request.
 *
 * `renewedBecauseExpired` is true when the token had already run out and had
 * to be renewed just to read it: that only happens after about an hour with no
 * activity, so it counts as idle.
 */
export function judgeSession(
  claims: SessionClaims,
  nowSeconds: number,
  options: { renewedBecauseExpired?: boolean; background?: boolean } = {},
): SessionVerdict {
  const policy = policyForRole(roleFromClaims(claims));
  if (options.renewedBecauseExpired) return { action: "sign_out", reason: "idle" };

  const issuedAt =
    typeof claims.iat === "number" && Number.isFinite(claims.iat) ? claims.iat : null;
  const signedInAt = signedInAtSeconds(claims);
  if (issuedAt === null || signedInAt === null) return { action: "sign_out", reason: "expired" };

  if (nowSeconds - signedInAt > policy.absoluteSeconds) {
    return { action: "sign_out", reason: "expired" };
  }
  const tokenAge = nowSeconds - issuedAt;
  if (tokenAge > policy.idleSeconds + REFRESH_AFTER_SECONDS) {
    return { action: "sign_out", reason: "idle" };
  }
  // Automatic background requests (status checks) never keep a session alive.
  if (tokenAge > REFRESH_AFTER_SECONDS && !options.background) return { action: "refresh" };
  return { action: "continue" };
}

const PROTECTED_PREFIXES = [
  "/farmer",
  "/buyer",
  "/operator",
  "/admin",
  "/profile",
  "/notifications",
];

export type PathKind = "api" | "protected" | "public";

export function pathKind(pathname: string): PathKind {
  if (pathname === "/api" || pathname.startsWith("/api/")) return "api";
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
    ? "protected"
    : "public";
}

/**
 * Where a person is sent after their session ended. Admins go to the home page
 * with no hint, so an unattended screen never shows where admins sign in.
 */
export function signedOutDestination(role: string | null, reason: SessionEndReason): string {
  return role === "admin" ? "/" : `/login?reason=${reason}`;
}

/** Header sent by automatic checks so they are not mistaken for activity. */
export const BACKGROUND_HEADER = "x-farmess-background";

/** "Chrome on Windows" from a browser's user-agent string, for the device list. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua.trim()) return "Unknown device";
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser\//.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  const system = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  if (browser === "Browser" && !system) return "Unknown device";
  return system ? `${browser} on ${system}` : browser;
}
