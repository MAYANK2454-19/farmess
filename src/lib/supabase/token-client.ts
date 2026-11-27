import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabasePublicConfig } from "./env";

/**
 * A Supabase client that acts as one signed-in user for the length of a
 * background job (work scheduled with after()). It carries the user's access
 * token directly instead of reading cookies, so it keeps working after the
 * response has been sent. Row-level security still applies exactly as it does
 * for that user's own requests.
 */
export function createUserTokenClient(accessToken: string) {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createSupabaseClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type UserTokenClient = ReturnType<typeof createUserTokenClient>;

/** Seconds until a JWT expires (0 when it cannot be read). The token is not verified here. */
export function secondsUntilExpiry(accessToken: string, nowMs = Date.now()): number {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof payload.exp === "number"
      ? Math.max(0, payload.exp - Math.floor(nowMs / 1000))
      : 0;
  } catch {
    return 0;
  }
}
