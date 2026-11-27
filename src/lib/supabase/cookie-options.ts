import { MAX_SESSION_SECONDS } from "@/lib/auth/session-policy";

/**
 * Sign-in cookies live no longer than the longest allowed session, instead of
 * the library default of 400 days. The server still enforces the real limits;
 * this simply stops a forgotten browser from carrying a dead session around.
 */
export const SESSION_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: MAX_SESSION_SECONDS,
};
